const mongoose = require("mongoose");
const { Schema } = mongoose;

const productViewSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    viewedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

// One row per (user, product) — a repeat view updates viewedAt rather than
// creating a new row, so "recently viewed" reflects distinct products.
productViewSchema.index({ user: 1, product: 1 }, { unique: true });
productViewSchema.index({ user: 1, viewedAt: -1 });

const ProductViewModel =
  mongoose.models.ProductView || mongoose.model("ProductView", productViewSchema);
module.exports = ProductViewModel;
