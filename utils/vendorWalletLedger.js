const mongoose = require("mongoose");
const UserModel = require("../models/User");
const VendorWalletTransactionModel = require("../models/VendorWalletTransaction");

class InsufficientBalanceError extends Error {}

// Mirrors utils/walletLedger.js (the rider ledger) but for vendors — atomically
// adjusts a vendor's wallet balance and records a ledger entry in one MongoDB
// transaction. Safe to call more than once with the same idempotencyKey: a
// duplicate is detected via the ledger's unique index and treated as
// already-applied rather than double-applied.
const applyVendorWalletEntry = async ({ vendorId, type, amount, reason, idempotencyKey, order, withdrawal }) => {
  if (!(amount > 0)) {
    throw new Error("Wallet entry amount must be positive");
  }

  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      const vendor = await UserModel.findById(vendorId).session(session);
      if (!vendor) {
        throw new Error("Vendor not found");
      }

      if (type === "debit" && vendor.walletBalance < amount) {
        throw new InsufficientBalanceError("Insufficient wallet balance");
      }

      vendor.walletBalance = type === "credit" ? vendor.walletBalance + amount : vendor.walletBalance - amount;
      await vendor.save({ session });

      const [entry] = await VendorWalletTransactionModel.create(
        [
          {
            vendor: vendorId,
            type,
            amount,
            balanceAfter: vendor.walletBalance,
            reason,
            order,
            withdrawal,
            idempotencyKey,
          },
        ],
        { session },
      );

      result = { vendor, entry, alreadyApplied: false };
    });

    return result;
  } catch (error) {
    if (error?.code === 11000) {
      const [entry, vendor] = await Promise.all([
        VendorWalletTransactionModel.findOne({ idempotencyKey }),
        UserModel.findById(vendorId),
      ]);
      return { vendor, entry, alreadyApplied: true };
    }
    throw error;
  } finally {
    session.endSession();
  }
};

module.exports = { applyVendorWalletEntry, InsufficientBalanceError };
