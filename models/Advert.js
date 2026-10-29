const mongoose = require("mongoose");
const { Schema } = mongoose;

// pending_payment: created, waiting on the Paystack transaction to confirm.
// active: paid — running until expiresAt. Whether it's still actually running
//   is `status === "active" && expiresAt > now`, checked at read time rather
//   than flipped by a background job (see getUserAdverts).
// failed: payment did not succeed.
// cancelled: stopped early because the boosted product became unsellable
//   (rejected, marked sold/inactive, edited back to pending, or deleted) —
//   see utils/advertLifecycle.js.
const ADVERT_STATUSES = ["pending_payment", "active", "failed", "cancelled"];

const AdvertSchema = new Schema(
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
    plan: {
      type: Schema.Types.ObjectId,
      ref: "AdvertPlan",
      required: true,
    },

    // Snapshot of the plan at purchase time — editing or deleting the plan
    // later never changes what this boost cost or how long it runs.
    planName: { type: String, required: true },
    durationDays: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },

    // Snapshot of the product's pickup point at purchase time, so the nearby
    // feed can query directly against the Advert without joining to Product,
    // and so a later change to the product's location doesn't move a boost
    // that's already running.
    pickupCoords: {
      type: { type: String, enum: ["Point"], required: true },
      coordinates: { type: [Number], required: true }, // [lng, lat]
    },

    status: {
      type: String,
      enum: ADVERT_STATUSES,
      default: "pending_payment",
    },
    paymentReference: { type: String, required: true, unique: true },
    paymentStatus: {
      type: String,
      enum: ["pending", "success", "failed"],
      default: "pending",
    },

    // Set once payment is confirmed (see verifyAdvertPayment).
    startAt: { type: Date },
    expiresAt: { type: Date },
    // Set when cancelActiveAdvertsForProduct stops this boost early.
    cancelledAt: { type: Date },
  },
  { timestamps: true },
);

AdvertSchema.index({ pickupCoords: "2dsphere" });
AdvertSchema.index({ vendor: 1, createdAt: -1 });
AdvertSchema.index({ status: 1, expiresAt: 1 });

const AdvertModel = mongoose.models.Advert || mongoose.model("Advert", AdvertSchema);

module.exports = AdvertModel;
module.exports.ADVERT_STATUSES = ADVERT_STATUSES;
