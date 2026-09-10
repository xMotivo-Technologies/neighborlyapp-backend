const mongoose = require("mongoose");
const { Schema } = mongoose;

// pending: awaiting admin review, amount already debited from the wallet.
// processing: admin approved and a transfer was submitted to Paystack; final
//   outcome not yet confirmed (arrives via webhook or manual reconciliation).
// approved: Paystack confirmed the transfer succeeded. Terminal.
// rejected: admin declined before submitting to Paystack; amount reversed. Terminal.
// failed: transfer was submitted but Paystack ultimately failed/reversed it;
//   amount reversed. Terminal.
const WITHDRAWAL_STATUSES = ["pending", "processing", "approved", "rejected", "failed"];

const WithdrawalSchema = new Schema(
  {
    rider: {
      type: Schema.Types.ObjectId,
      ref: "Rider",
      required: true,
    },
    amount: { type: Number, required: true, min: 0.01 },
    status: {
      type: String,
      enum: WITHDRAWAL_STATUSES,
      default: "pending",
    },

    // Snapshot of the rider's bank details at request time.
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

WithdrawalSchema.index({ rider: 1, createdAt: -1 });
WithdrawalSchema.index({ status: 1 });

const WithdrawalModel = mongoose.models.Withdrawal || mongoose.model("Withdrawal", WithdrawalSchema);

module.exports = WithdrawalModel;
module.exports.WITHDRAWAL_STATUSES = WITHDRAWAL_STATUSES;
