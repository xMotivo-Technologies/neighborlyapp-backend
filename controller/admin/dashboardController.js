const UserModel = require("../../models/User");
const ProductModel = require("../../models/Products");
const OrderModel = require("../../models/Order");
const RiderModel = require("../../models/Rider");
const WithdrawalModel = require("../../models/Withdrawal");
const ReportModel = require("../../models/Report");
const ReviewModel = require("../../models/Review");

const ORDER_STATUSES = ["pending_payment", "paid", "processing", "shipped", "completed", "cancelled"];

// A same-moment snapshot of headline numbers and anything needing admin
// attention right now. GET /admin/analytics is for trends over time instead.
const getDashboard = async (req, res) => {
  try {
    const [
      totalUsers,
      totalVendors,
      totalRiders,
      pendingVendorApplications,
      pendingRiderApplications,
      totalProducts,
      activeProducts,
      pendingModerationProducts,
      featuredProducts,
      totalOrders,
      orderStatusCounts,
      revenueAgg,
      pendingWithdrawals,
      pendingReports,
      totalReviews,
    ] = await Promise.all([
      UserModel.countDocuments({ isDeleted: false }),
      UserModel.countDocuments({ role: "vendor", isDeleted: false }),
      RiderModel.countDocuments({ status: "approved" }),
      UserModel.countDocuments({ vendorStatus: "pending" }),
      RiderModel.countDocuments({ status: "pending" }),
      ProductModel.countDocuments(),
      ProductModel.countDocuments({ status: "active" }),
      ProductModel.countDocuments({ moderationStatus: "pending" }),
      ProductModel.countDocuments({ featured: true }),
      OrderModel.countDocuments(),
      OrderModel.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      OrderModel.aggregate([
        { $match: { paymentStatus: "success" } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
      WithdrawalModel.countDocuments({ status: "pending" }),
      ReportModel.countDocuments({ status: "pending" }),
      ReviewModel.countDocuments({ status: "visible" }),
    ]);

    const byStatus = Object.fromEntries(ORDER_STATUSES.map((status) => [status, 0]));
    orderStatusCounts.forEach(({ _id, count }) => {
      byStatus[_id] = count;
    });

    return res.status(200).json({
      users: {
        total: totalUsers,
        vendors: totalVendors,
        riders: totalRiders,
        pendingVendorApplications,
        pendingRiderApplications,
      },
      products: {
        total: totalProducts,
        active: activeProducts,
        pendingModeration: pendingModerationProducts,
        featured: featuredProducts,
      },
      orders: {
        total: totalOrders,
        byStatus,
        revenue: revenueAgg[0]?.total || 0,
      },
      pendingActions: {
        withdrawals: pendingWithdrawals,
        reports: pendingReports,
      },
      reviews: {
        total: totalReviews,
      },
    });
  } catch (error) {
    console.error("Get dashboard error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Trend data over a rolling window (?days=, default 30, max 365).
const getAnalytics = async (req, res) => {
  const parsedDays = parseInt(req.query.days, 10);
  const days = Number.isInteger(parsedDays) && parsedDays > 0 ? Math.min(parsedDays, 365) : 30;

  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

  try {
    const [newUsers, newOrders, revenueAgg, dailyRevenue, topVendorsAgg] = await Promise.all([
      UserModel.countDocuments({ createdAt: { $gte: from }, isDeleted: false }),
      OrderModel.countDocuments({ createdAt: { $gte: from } }),
      OrderModel.aggregate([
        { $match: { paymentStatus: "success", paidAt: { $gte: from } } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
      OrderModel.aggregate([
        { $match: { paymentStatus: "success", paidAt: { $gte: from } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$paidAt" } },
            revenue: { $sum: "$totalAmount" },
            orders: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      OrderModel.aggregate([
        { $match: { paymentStatus: "success", paidAt: { $gte: from } } },
        { $group: { _id: "$vendor", revenue: { $sum: "$totalAmount" }, orders: { $sum: 1 } } },
        { $sort: { revenue: -1 } },
        { $limit: 5 },
      ]),
    ]);

    const vendorIds = topVendorsAgg.map((v) => v._id);
    const vendors = await UserModel.find({ _id: { $in: vendorIds } }, "businessName");
    const vendorNameById = Object.fromEntries(vendors.map((v) => [v._id.toString(), v.businessName]));

    const topVendors = topVendorsAgg.map((v) => ({
      vendorId: v._id,
      businessName: vendorNameById[v._id.toString()] || null,
      revenue: v.revenue,
      orders: v.orders,
    }));

    return res.status(200).json({
      range: { days, from, to },
      newUsers,
      newOrders,
      revenue: revenueAgg[0]?.total || 0,
      dailyRevenue: dailyRevenue.map((d) => ({ date: d._id, revenue: d.revenue, orders: d.orders })),
      topVendors,
    });
  } catch (error) {
    console.error("Get analytics error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = { getDashboard, getAnalytics };
