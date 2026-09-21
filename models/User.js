const mongoose = require("mongoose");
const { Schema } = mongoose;

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
    },
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    hashPass: {
      select: false,
      type: String,
      required: true,
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ["user", "vendor"],
      default: "user",
      required: true,
    },
    transactionPin: {
      type: String,
      select: false,
    },
    pinExists: {
      type: Boolean,
      required: true,
      default: false,
    },
    status: {
      type: String,
      default: "active",
      enum: ["active", "suspended", "banned"],
    },
    suspendedAt: { type: Date },
    suspendReason: { type: String },
    bannedAt: { type: Date },
    banReason: { type: String },
    otp: {
      type: String,
      select: false,
    },
    resetCodeExpires: {
      type: Date,
      select: false,
    },
    refreshToken: {
      type: String,
      select: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
    },
    expoTokens: {
      type: [String],
      default: [],
    },
    notificationsEnabled: {
      type: Boolean,
      default: true,
    },
    notificationPrefs: {
      orders: { type: Boolean, default: true },
      deliveries: { type: Boolean, default: true },
      wallet: { type: Boolean, default: true },
      promotions: { type: Boolean, default: true },
    },

    // Vendor-specific fields
    businessName: { type: String },
    businessAddress: { type: String },
    storeDescription: { type: String },
    vendorStatus: {
      type: String,
      enum: ["none", "pending", "approved", "rejected"],
      default: "none",
    },

    // Vendor earnings wallet. Credited with an order's vendorEarning once the
    // buyer confirms delivery (see confirmDelivery in deliveryController.js).
    walletBalance: { type: Number, default: 0, min: 0 },
    // Bank details are only ever written after being resolved against
    // Paystack (see updateVendorBankDetails) — bankAccountName is never
    // trusted from the client.
    bankAccountNumber: { type: String },
    bankCode: { type: String },
    bankName: { type: String },
    bankAccountName: { type: String },
    // Cached Paystack transfer recipient for this bank account; cleared
    // whenever bank details change so it gets recreated on next withdrawal.
    paystackRecipientCode: { type: String },

    // Denormalized from visible Reviews where this user is the vendor —
    // recomputed on review create/hide, never written to directly elsewhere.
    ratingAverage: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

const UserModel = mongoose.models.User || mongoose.model("User", userSchema);
module.exports = UserModel;
