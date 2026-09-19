const mongoose = require("mongoose");
const { Schema } = mongoose;

const ReviewSchema = new Schema(
  {
    order: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      unique: true, // one review per order
    },
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    buyer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    vendor: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String },

    status: {
      type: String,
      enum: ["visible", "hidden"],
      default: "visible",
    },
    hiddenAt: { type: Date },
    hiddenBy: { type: Schema.Types.ObjectId, ref: "Admin" },
    hiddenReason: { type: String },
  },
  { timestamps: true },
);

ReviewSchema.index({ vendor: 1, status: 1, createdAt: -1 });

const ReviewModel = mongoose.models.Review || mongoose.model("Review", ReviewSchema);

module.exports = ReviewModel;
