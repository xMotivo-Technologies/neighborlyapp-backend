const mongoose = require("mongoose");
const { Schema } = mongoose;

const DeviceTokenSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    deviceType: {
      type: String,
      enum: ["android", "ios", "web", "unknown"],
      default: "unknown",
    },
    lastActive: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

DeviceTokenSchema.index({ user: 1, token: 1 });

const DeviceTokenModel =
  mongoose.models.DeviceToken || mongoose.model("DeviceToken", DeviceTokenSchema);

module.exports = DeviceTokenModel;
