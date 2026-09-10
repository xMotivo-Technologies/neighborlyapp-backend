const mongoose = require("mongoose");
const { Schema } = mongoose;

const RiderSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    vehicleType: {
      type: String,
      enum: ["bicycle", "motorcycle", "car", "van"],
      required: true,
    },
    vehiclePlateNumber: { type: String },
    licenseNumber: { type: String },
    status: {
      type: String,
      enum: ["pending", "approved", "suspended"],
      default: "pending",
    },
    isAvailable: { type: Boolean, default: false },
    currentLocation: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: {
        type: [Number], // [lng, lat]
      },
    },
    locationUpdatedAt: { type: Date },
    suspendedAt: { type: Date },
    suspendReason: { type: String },

    walletBalance: { type: Number, default: 0, min: 0 },

    // Bank details are only ever written after being resolved against Paystack
    // (see updateRiderProfile) — bankAccountName is never trusted from the client.
    bankAccountNumber: { type: String },
    bankCode: { type: String },
    bankName: { type: String },
    bankAccountName: { type: String },
    // Cached Paystack transfer recipient for this bank account; cleared
    // whenever bank details change so it gets recreated on next withdrawal.
    paystackRecipientCode: { type: String },
  },
  { timestamps: true },
);

RiderSchema.index({ currentLocation: "2dsphere" });

const RiderModel = mongoose.models.Rider || mongoose.model("Rider", RiderSchema);

module.exports = RiderModel;
