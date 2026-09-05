const mongoose = require("mongoose");
const { Schema } = mongoose;

const advertSchema = new Schema(
  {
    vendor: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
  },
  { timestamps: true },
);

const AdvertModel = mongoose.models.Advert || mongoose.model("Advert", advertSchema);
module.exports = AdvertModel;
