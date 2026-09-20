const mongoose = require("mongoose");
const { Schema } = mongoose;

// Mirrors models/WalletTransaction.js (the rider ledger) but for vendors.
const VendorWalletTransactionSchema = new Schema(
  {
    vendor: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ["credit", "debit"],
      required: true,
    },
    amount: { type: Number, required: true, min: 0.01 },
    // Snapshot of the wallet balance immediately after this entry, so history
    // reads don't need to replay the whole ledger.
    balanceAfter: { type: Number, required: true, min: 0 },
    reason: {
      type: String,
      enum: ["order_earning", "withdrawal", "withdrawal_reversal"],
      required: true,
    },
    order: { type: Schema.Types.ObjectId, ref: "Order" },
    withdrawal: { type: Schema.Types.ObjectId, ref: "VendorWithdrawal" },
    // Deterministic per source event (e.g. `vendor_earning_<orderId>`,
    // `withdrawal_reversal_<withdrawalId>`) so the unique index below is what
    // actually prevents double-crediting/debiting on retries.
    idempotencyKey: { type: String, required: true, unique: true },
  },
  { timestamps: true },
);

VendorWalletTransactionSchema.index({ vendor: 1, createdAt: -1 });

const VendorWalletTransactionModel =
  mongoose.models.VendorWalletTransaction ||
  mongoose.model("VendorWalletTransaction", VendorWalletTransactionSchema);

module.exports = VendorWalletTransactionModel;
