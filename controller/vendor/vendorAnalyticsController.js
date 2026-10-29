const ProductModel = require("../../models/Products");
const OrderModel = require("../../models/Order");
const ProductViewModel = require("../../models/ProductView");
const VendorWithdrawalModel = require("../../models/VendorWithdrawal");
const FavoriteModel = require("../../models/Favorite");

const ORDER_STATUSES = ["pending_payment", "paid", "processing", "shipped", "completed", "cancelled"];

// A same-moment snapshot of this vendor's headline numbers. Mirrors admin
// dashboardController's getDashboard, scoped to req.user (isVendor middleware
// already ran). GET /vendor/analytics is for trends over time instead.
const getVendorDashboard = async (req, res) => {
  const vendor = req.user._id;

  try {
    const [
      totalProducts,
      activeProducts,
      pendingModerationProducts,
      featuredProducts,
      productStats,
      totalOrders,
      orderStatusCounts,
      earningsAgg,
      pendingWithdrawals,
    ] = await Promise.all([
      ProductModel.countDocuments({ vendor }),
      ProductModel.countDocuments({ vendor, status: "active" }),
      ProductModel.countDocuments({ vendor, moderationStatus: "pending" }),
      ProductModel.countDocuments({ vendor, featured: true }),
      ProductModel.aggregate([
        { $match: { vendor } },
        { $group: { _id: null, totalViews: { $sum: "$viewCount" }, totalFavorites: { $sum: "$favoriteCount" } } },
      ]),
      OrderModel.countDocuments({ vendor }),
      OrderModel.aggregate([{ $match: { vendor } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
      OrderModel.aggregate([
        { $match: { vendor, paymentStatus: "success" } },
        { $group: { _id: null, revenue: { $sum: "$totalAmount" }, earnings: { $sum: "$vendorEarning" } } },
      ]),
      VendorWithdrawalModel.countDocuments({ vendor, status: "pending" }),
    ]);

    const byStatus = Object.fromEntries(ORDER_STATUSES.map((status) => [status, 0]));
    orderStatusCounts.forEach(({ _id, count }) => {
      byStatus[_id] = count;
    });

    return res.status(200).json({
      products: {
        total: totalProducts,
        active: activeProducts,
        pendingModeration: pendingModerationProducts,
        featured: featuredProducts,
        totalViews: productStats[0]?.totalViews || 0,
        totalFavorites: productStats[0]?.totalFavorites || 0,
      },
      orders: {
        total: totalOrders,
        byStatus,
        revenue: earningsAgg[0]?.revenue || 0,
        earnings: earningsAgg[0]?.earnings || 0,
      },
      wallet: {
        balance: req.user.walletBalance,
        pendingWithdrawals,
      },
      rating: {
        average: req.user.ratingAverage,
        count: req.user.ratingCount,
      },
    });
  } catch (error) {
    console.error("Get vendor dashboard error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Trend data over a rolling window (?days=, default 30, max 365).
const getVendorAnalytics = async (req, res) => {
  const vendor = req.user._id;
  const parsedDays = parseInt(req.query.days, 10);
  const days = Number.isInteger(parsedDays) && parsedDays > 0 ? Math.min(parsedDays, 365) : 30;

  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

  try {
    const vendorProductIds = await ProductModel.find({ vendor }, "_id").then((docs) => docs.map((d) => d._id));

    const [newOrders, earningsAgg, dailyRevenue, topProductsAgg, uniqueViewers] = await Promise.all([
      OrderModel.countDocuments({ vendor, createdAt: { $gte: from } }),
      OrderModel.aggregate([
        { $match: { vendor, paymentStatus: "success", paidAt: { $gte: from } } },
        { $group: { _id: null, revenue: { $sum: "$totalAmount" }, earnings: { $sum: "$vendorEarning" } } },
      ]),
      OrderModel.aggregate([
        { $match: { vendor, paymentStatus: "success", paidAt: { $gte: from } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$paidAt" } },
            revenue: { $sum: "$totalAmount" },
            orders: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      // Best sellers in range, ranked by revenue from this vendor's own order items.
      OrderModel.aggregate([
        { $match: { vendor, paymentStatus: "success", paidAt: { $gte: from } } },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.product",
            productName: { $first: "$items.productName" },
            unitsSold: { $sum: "$items.quantity" },
            revenue: { $sum: "$items.lineTotal" },
          },
        },
        { $sort: { revenue: -1 } },
        { $limit: 5 },
      ]),
      // Distinct viewers in range — ProductView upserts per (user, product), so
      // a repeat viewer updates their row's viewedAt rather than adding a new
      // one. This counts people, not raw page-view hits (that's viewCount).
      ProductViewModel.countDocuments({ product: { $in: vendorProductIds }, viewedAt: { $gte: from } }),
    ]);

    const topProducts = topProductsAgg.map((p) => ({
      productId: p._id,
      productName: p.productName,
      unitsSold: p.unitsSold,
      revenue: p.revenue,
    }));

    return res.status(200).json({
      range: { days, from, to },
      newOrders,
      revenue: earningsAgg[0]?.revenue || 0,
      earnings: earningsAgg[0]?.earnings || 0,
      dailyRevenue: dailyRevenue.map((d) => ({ date: d._id, revenue: d.revenue, orders: d.orders })),
      topProducts,
      uniqueViewers,
    });
  } catch (error) {
    console.error("Get vendor analytics error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Same shape as getVendorAnalytics but narrowed to a single listing — lets a
// vendor see how one product is actually performing rather than only
// store-wide totals.
const getProductAnalytics = async (req, res) => {
  const vendor = req.user._id;
  const { id } = req.params;
  const parsedDays = parseInt(req.query.days, 10);
  const days = Number.isInteger(parsedDays) && parsedDays > 0 ? Math.min(parsedDays, 365) : 30;

  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

  try {
    const product = await ProductModel.findOne({ _id: id, vendor });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const [
      allTimeSalesAgg,
      rangeSalesAgg,
      dailyRevenue,
      allTimeViewers,
      rangeViewers,
      favoriteCount,
    ] = await Promise.all([
      OrderModel.aggregate([
        { $match: { vendor, paymentStatus: "success" } },
        { $unwind: "$items" },
        { $match: { "items.product": product._id } },
        {
          $group: {
            _id: null,
            unitsSold: { $sum: "$items.quantity" },
            revenue: { $sum: "$items.lineTotal" },
            orders: { $sum: 1 },
          },
        },
      ]),
      OrderModel.aggregate([
        { $match: { vendor, paymentStatus: "success", paidAt: { $gte: from } } },
        { $unwind: "$items" },
        { $match: { "items.product": product._id } },
        {
          $group: {
            _id: null,
            unitsSold: { $sum: "$items.quantity" },
            revenue: { $sum: "$items.lineTotal" },
            orders: { $sum: 1 },
          },
        },
      ]),
      OrderModel.aggregate([
        { $match: { vendor, paymentStatus: "success", paidAt: { $gte: from } } },
        { $unwind: "$items" },
        { $match: { "items.product": product._id } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$paidAt" } },
            revenue: { $sum: "$items.lineTotal" },
            unitsSold: { $sum: "$items.quantity" },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      // Distinct viewers — see the note on uniqueViewers in getVendorAnalytics.
      ProductViewModel.countDocuments({ product: product._id }),
      ProductViewModel.countDocuments({ product: product._id, viewedAt: { $gte: from } }),
      FavoriteModel.countDocuments({ product: product._id }),
    ]);

    return res.status(200).json({
      product: { id: product._id, name: product.name, status: product.status },
      range: { days, from, to },
      allTime: {
        unitsSold: allTimeSalesAgg[0]?.unitsSold || 0,
        revenue: allTimeSalesAgg[0]?.revenue || 0,
        orders: allTimeSalesAgg[0]?.orders || 0,
        views: product.viewCount,
        uniqueViewers: allTimeViewers,
        favorites: favoriteCount,
      },
      inRange: {
        unitsSold: rangeSalesAgg[0]?.unitsSold || 0,
        revenue: rangeSalesAgg[0]?.revenue || 0,
        orders: rangeSalesAgg[0]?.orders || 0,
        uniqueViewers: rangeViewers,
        dailyRevenue: dailyRevenue.map((d) => ({ date: d._id, revenue: d.revenue, unitsSold: d.unitsSold })),
      },
    });
  } catch (error) {
    console.error("Get product analytics error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = { getVendorDashboard, getVendorAnalytics, getProductAnalytics };
