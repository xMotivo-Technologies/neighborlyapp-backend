const mongoose = require("mongoose");
const { Schema } = mongoose;

const DELIVERY_STATUSES = ["pending", "accepted", "picked_up", "in_transit", "delivered", "confirmed", "cancelled"];

const DeliverySchema = new Schema(
  {
    order: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      unique: true,
    },
    vendor: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    buyer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    rider: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    pickupAddress: { type: String, required: true },
    pickupCoords: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: {
        type: [Number], // [lng, lat]
      },
    },
    dropoffAddress: { type: String, required: true },
    dropoffCoords: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: {
        type: [Number], // [lng, lat]
      },
    },

    distanceKm: { type: Number },
    fee: { type: Number },
    estimatedDurationMinutes: { type: Number },

    // Neighborly's cut of the delivery fee, snapshotted from PlatformSettings
    // when the delivery is created so a later rate change never rewrites what
    // this delivery actually owed.
    platformCommissionPercent: { type: Number, min: 0, max: 100 },
    platformDeliveryCommission: { type: Number, min: 0 },
    // riderEarning = fee - platformDeliveryCommission. Paid into the rider's
    // wallet once the buyer confirms delivery.
    riderEarning: { type: Number, min: 0 },

    status: {
      type: String,
      enum: DELIVERY_STATUSES,
      default: "pending",
    },
    acceptedAt: { type: Date },
    pickedUpAt: { type: Date },
    deliveredAt: { type: Date },
    confirmedAt: { type: Date },
    // true when confirmed by the auto-confirm sweep rather than the buyer
    // tapping confirm — see autoConfirmStaleDeliveries in deliveryController.
    autoConfirmed: { type: Boolean, default: false },
    // Set when crediting the rider's wallet throws in confirmDelivery/
    // autoConfirmStaleDeliveries; cleared once a retry succeeds. Lets a
    // sweep find and retry deliveries that were confirmed but never paid out.
    riderPayoutError: { type: String },
  },
  { timestamps: true },
);

DeliverySchema.index({ pickupCoords: "2dsphere" });
DeliverySchema.index({ status: 1, rider: 1 });

const DeliveryModel = mongoose.models.Delivery || mongoose.model("Delivery", DeliverySchema);

module.exports = DeliveryModel;
module.exports.DELIVERY_STATUSES = DELIVERY_STATUSES;
