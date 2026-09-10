const mongoose = require("mongoose");
const { Schema } = mongoose;

const WalletTransactionSchema = new Schema(
  {
    rider: {
      type: Schema.Types.ObjectId,
      ref: "Rider",
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
      enum: ["delivery_earning", "withdrawal", "withdrawal_reversal"],
      required: true,
    },
    delivery: { type: Schema.Types.ObjectId, ref: "Delivery" },
    withdrawal: { type: Schema.Types.ObjectId, ref: "Withdrawal" },
    // Deterministic per source event (e.g. `earning_<deliveryId>`,
    // `withdrawal_reversal_<withdrawalId>`) so the unique index below is what
    // actually prevents double-crediting/debiting on retries.
    idempotencyKey: { type: String, required: true, unique: true },
  },
  { timestamps: true },
);

WalletTransactionSchema.index({ rider: 1, createdAt: -1 });

const WalletTransactionModel =
  mongoose.models.WalletTransaction || mongoose.model("WalletTransaction", WalletTransactionSchema);

module.exports = WalletTransactionModel;
