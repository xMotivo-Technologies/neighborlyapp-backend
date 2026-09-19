const ReviewModel = require("../../models/Review");
const OrderModel = require("../../models/Order");
const UserModel = require("../../models/User");
const { getPagination, buildPaginationMeta } = require("../../utils/pagination");

// Recomputes a vendor's denormalized rating from their currently-visible
// reviews. Called after any write that can change what's visible (create,
// hide, unhide) so it never drifts — simple recomputation over a delta
// counter, since review writes are infrequent.
const recomputeVendorRating = async (vendorId) => {
  const [stats] = await ReviewModel.aggregate([
    { $match: { vendor: vendorId, status: "visible" } },
    { $group: { _id: null, average: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);

  await UserModel.findByIdAndUpdate(vendorId, {
    ratingAverage: stats ? Math.round(stats.average * 10) / 10 : 0,
    ratingCount: stats ? stats.count : 0,
  });
};

// Only the buyer on a completed order can review it, once, 1-5 stars.
// Vendor and product are always taken from the order, never from the client.
const createReview = async (req, res) => {
  const { orderId, rating, comment } = req.body;

  if (!orderId) {
    return res.status(400).json({ message: "orderId is required" });
  }

  const parsedRating = Number(rating);
  if (!Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5) {
    return res.status(400).json({ message: "rating must be an integer between 1 and 5" });
  }

  try {
    const order = await OrderModel.findById(orderId);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.buyer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only the buyer on this order can review it" });
    }

    if (order.status !== "completed") {
      return res.status(400).json({ message: "Order must be delivered before it can be reviewed" });
    }

    const existing = await ReviewModel.findOne({ order: order._id });
    if (existing) {
      return res.status(400).json({ message: "This order has already been reviewed" });
    }

    const review = await ReviewModel.create({
      order: order._id,
      product: order.product,
      buyer: order.buyer,
      vendor: order.vendor,
      rating: parsedRating,
      comment,
    });

    await recomputeVendorRating(order.vendor);

    return res.status(201).json({ message: "Review submitted", review });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({ message: "This order has already been reviewed" });
    }
    console.error("Create review error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Public reputation listing for a vendor (or any reviewed user) — hidden
// reviews are excluded.
const getUserReviews = async (req, res) => {
  const { id } = req.params;

  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = { vendor: id, status: "visible" };

    const [reviews, total] = await Promise.all([
      ReviewModel.find(filter)
        .populate("buyer", "firstName lastName")
        .populate("product", "name imgUrl")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ReviewModel.countDocuments(filter),
    ]);

    return res.status(200).json({
      data: reviews,
      pagination: buildPaginationMeta({ page, limit, total }),
    });
  } catch (error) {
    console.error("Get user reviews error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const getReviewById = async (req, res) => {
  const { id } = req.params;

  try {
    const review = await ReviewModel.findOne({ _id: id, status: "visible" })
      .populate("buyer", "firstName lastName")
      .populate("vendor", "businessName")
      .populate("product", "name imgUrl");

    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    return res.status(200).json({ review });
  } catch (error) {
    console.error("Get review error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = { createReview, getUserReviews, getReviewById, recomputeVendorRating };
