const mongoose = require("mongoose");
const { Schema } = mongoose;

const ProductSchema = new Schema(
  {
    name: { type: String, required: true },
    desc: { type: String, required: true },
    imgUrl: { type: [String], required: true },

    price: { type: Number, required: true, min: [0] }, 
    category: {
      type: String,
      ref: "CategoryModel", 
      // required: true,
    },
    location: { type: String, required: true },
    locationCoords: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: {
        type: [Number], // [lng, lat]
      },
    },
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "sold", "inactive"],
      default: "active",
    },
    condition: {
      type: String,
      enum: ["new", "like_new", "good", "fair"],
    },
    moderationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "approved",
    },
    viewCount: { type: Number, default: 0 },
    favoriteCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

ProductSchema.index({ locationCoords: "2dsphere" });
ProductSchema.index({ name: "text", desc: "text" });

const ProductModel = mongoose.models.Product || mongoose.model("Product", ProductSchema);

module.exports = ProductModel;
