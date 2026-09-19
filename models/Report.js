const mongoose = require("mongoose");
const { Schema } = mongoose;

const TARGET_TYPES = ["product", "conversation"];
const REASONS = ["spam", "scam_or_fraud", "prohibited_item", "harassment_or_abuse", "inappropriate_content", "other"];
const RESOLUTIONS = ["action_taken", "no_action"];

const ReportSchema = new Schema(
  {
    reporter: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Polymorphic target — "product" ids are validated against ProductModel
    // at creation time. "conversation" ids are stored as-is: there is no
    // conversation/messaging system in this codebase yet, so they can't be
    // validated or resolved to anything on the backend today.
    targetType: {
      type: String,
      enum: TARGET_TYPES,
      required: true,
    },
    targetId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    reason: {
      type: String,
      enum: REASONS,
      required: true,
    },
    description: { type: String },

    status: {
      type: String,
      enum: ["pending", "resolved"],
      default: "pending",
    },
    resolution: {
      type: String,
      enum: RESOLUTIONS,
    },
    resolutionNote: { type: String },
    resolvedBy: { type: Schema.Types.ObjectId, ref: "Admin" },
    resolvedAt: { type: Date },
  },
  { timestamps: true },
);

ReportSchema.index({ status: 1, createdAt: -1 });
ReportSchema.index({ targetType: 1, targetId: 1 });

const ReportModel = mongoose.models.Report || mongoose.model("Report", ReportSchema);

module.exports = ReportModel;
module.exports.TARGET_TYPES = TARGET_TYPES;
module.exports.REASONS = REASONS;
module.exports.RESOLUTIONS = RESOLUTIONS;
