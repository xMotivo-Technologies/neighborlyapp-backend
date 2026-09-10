const mongoose = require("mongoose");
const RiderModel = require("../models/Rider");
const WalletTransactionModel = require("../models/WalletTransaction");

class InsufficientBalanceError extends Error {}

// Atomically adjusts a rider's wallet balance and records a ledger entry in
// one MongoDB transaction. Safe to call more than once with the same
// idempotencyKey: a duplicate is detected via the ledger's unique index and
// treated as already-applied rather than double-applied.
const applyWalletEntry = async ({ riderId, type, amount, reason, idempotencyKey, delivery, withdrawal }) => {
  if (!(amount > 0)) {
    throw new Error("Wallet entry amount must be positive");
  }

  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      const rider = await RiderModel.findById(riderId).session(session);
      if (!rider) {
        throw new Error("Rider not found");
      }

      if (type === "debit" && rider.walletBalance < amount) {
        throw new InsufficientBalanceError("Insufficient wallet balance");
      }

      rider.walletBalance = type === "credit" ? rider.walletBalance + amount : rider.walletBalance - amount;
      await rider.save({ session });

      const [entry] = await WalletTransactionModel.create(
        [
          {
            rider: riderId,
            type,
            amount,
            balanceAfter: rider.walletBalance,
            reason,
            delivery,
            withdrawal,
            idempotencyKey,
          },
        ],
        { session },
      );

      result = { rider, entry, alreadyApplied: false };
    });

    return result;
  } catch (error) {
    if (error?.code === 11000) {
      const [entry, rider] = await Promise.all([
        WalletTransactionModel.findOne({ idempotencyKey }),
        RiderModel.findById(riderId),
      ]);
      return { rider, entry, alreadyApplied: true };
    }
    throw error;
  } finally {
    session.endSession();
  }
};

module.exports = { applyWalletEntry, InsufficientBalanceError };
