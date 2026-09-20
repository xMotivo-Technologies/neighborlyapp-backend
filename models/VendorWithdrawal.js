const mongoose = require("mongoose");
const { Schema } = mongoose;

// Mirrors models/Withdrawal.js (the rider withdrawal flow) but for vendors.
// Kept as a separate model/collection rather than a generalized one so the
// already-working rider payout path is never touched by vendor changes.
//
// pending: awaiting admin review, amount already debited from the wallet.
// processing: admin approved and a transfer was submitted to Paystack; final
//   outcome not yet confirmed (arrives via webhook or manual reconciliation).
// approved: Paystack confirmed the transfer succeeded. Terminal.
// rejected: admin declined before submitting to Paystack; amount reversed. Terminal.
// failed: transfer was submitted but Paystack ultimately failed/reversed it;
//   amount reversed. Terminal.
const VENDOR_WITHDRAWAL_STATUSES = ["pending", "processing", "approved", "rejected", "failed"];

const VendorWithdrawalSchema = new Schema(
  {
    vendor: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: { type: Number, required: true, min: 0.01 },
    status: {
      type: String,
      enum: VENDOR_WITHDRAWAL_STATUSES,
      default: "pending",
    },

    // Snapshot of the vendor's bank details at request time.
    bankAccountNumber: { type: String, required: true },
    bankCode: { type: String, required: true },
    bankName: { type: String, required: true },
    bankAccountName: { type: String, required: true },

    // Our own idempotency key, sent to Paystack as `reference`. Generated once
    // and persisted before the first transfer attempt so a retry after a
    // crash reuses it instead of risking a second payout.
    transferReference: { type: String, unique: true, sparse: true },
    transferCode: { type: String },
    paystackStatus: { type: String },
    failureReason: { type: String },
    rejectionReason: { type: String },

    reviewedBy: { type: Schema.Types.ObjectId, ref: "Admin" },
    reviewedAt: { type: Date },
  },
  { timestamps: true },
);

VendorWithdrawalSchema.index({ vendor: 1, createdAt: -1 });
VendorWithdrawalSchema.index({ status: 1 });

const VendorWithdrawalModel =
  mongoose.models.VendorWithdrawal || mongoose.model("VendorWithdrawal", VendorWithdrawalSchema);

module.exports = VendorWithdrawalModel;
module.exports.VENDOR_WITHDRAWAL_STATUSES = VENDOR_WITHDRAWAL_STATUSES;
