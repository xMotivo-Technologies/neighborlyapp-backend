const ReviewModel = require("../../models/Review");
const { recomputeVendorRating } = require("../review/reviewController");

const hideReview = async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  try {
    const review = await ReviewModel.findById(id);

    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    if (review.status === "hidden") {
      return res.status(400).json({ message: "Review is already hidden" });
    }

    review.status = "hidden";
    review.hiddenAt = new Date();
    review.hiddenBy = req.admin._id;
    review.hiddenReason = reason;
    await review.save();

    await recomputeVendorRating(review.vendor);

    return res.status(200).json({ message: "Review hidden", review });
  } catch (error) {
    console.error("Hide review error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = { hideReview };
