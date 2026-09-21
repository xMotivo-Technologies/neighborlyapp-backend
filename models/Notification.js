const mongoose = require("mongoose");
const { Schema } = mongoose;

const NOTIFICATION_TYPES = [
  "order",
  "delivery",
  "wallet",
  "account",
  "review",
  "promotion",
  "system",
];

const NOTIFICATION_CHANNELS = [
  "orders",
  "deliveries",
  "wallet",
  "promotions",
  "general",
];

const NotificationSchema = new Schema(
  {
    recipient: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      default: "system",
    },
    channelId: {
      type: String,
      enum: NOTIFICATION_CHANNELS,
      default: "general",
    },
    data: {
      type: Schema.Types.Mixed,
      default: {},
    },
    read: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

NotificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });
NotificationSchema.index({ recipient: 1, createdAt: -1 });

const NotificationModel =
  mongoose.models.Notification || mongoose.model("Notification", NotificationSchema);

module.exports = NotificationModel;
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
module.exports.NOTIFICATION_CHANNELS = NOTIFICATION_CHANNELS;
