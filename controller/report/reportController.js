const ReportModel = require("../../models/Report");
const ProductModel = require("../../models/Products");
const { TARGET_TYPES, REASONS } = require("../../models/Report");

// Reports feed a manual moderation queue (see controller/admin/reportModeration.js)
// rather than triggering any automated action — deliberately, per the launch plan.
const createReport = async (req, res) => {
  const { targetType, targetId, reason, description } = req.body;

  if (!TARGET_TYPES.includes(targetType)) {
    return res.status(400).json({ message: `targetType must be one of: ${TARGET_TYPES.join(", ")}` });
  }

  if (!targetId) {
    return res.status(400).json({ message: "targetId is required" });
  }

  if (!REASONS.includes(reason)) {
    return res.status(400).json({ message: `reason must be one of: ${REASONS.join(", ")}` });
  }

  if (reason === "other" && !description) {
    return res.status(400).json({ message: 'description is required when reason is "other"' });
  }

  try {
    if (targetType === "product") {
      const product = await ProductModel.findById(targetId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      if (product.vendor && product.vendor.toString() === req.user._id.toString()) {
        return res.status(400).json({ message: "You cannot report your own product" });
      }
    }
    // "conversation" targetId can't be validated — no conversation/messaging
    // model exists yet. Stored as-is for whenever that lands.

    const report = await ReportModel.create({
      reporter: req.user._id,
      targetType,
      targetId,
      reason,
      description,
    });

    return res.status(201).json({ message: "Report submitted", report });
  } catch (error) {
    console.error("Create report error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = { createReport };
