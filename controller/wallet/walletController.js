const mongoose = require("mongoose");
const RiderModel = require("../../models/Rider");
const WalletTransactionModel = require("../../models/WalletTransaction");
const WithdrawalModel = require("../../models/Withdrawal");
const { getPagination, buildPaginationMeta } = require("../../utils/pagination");

const MINIMUM_WITHDRAWAL_AMOUNT = 500;

// req.rider is populated by the isRider middleware.
const getWallet = async (req, res) => {
  return res.status(200).json({
    balance: req.rider.walletBalance,
    currency: "NGN",
    bankAccountNumber: req.rider.bankAccountNumber,
    bankName: req.rider.bankName,
    bankAccountName: req.rider.bankAccountName,
  });
};

const getWalletHistory = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = { rider: req.rider._id };
    if (req.query.type) filter.type = req.query.type;

    const [transactions, total] = await Promise.all([
      WalletTransactionModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      WalletTransactionModel.countDocuments(filter),
    ]);

    return res.status(200).json({
      data: transactions,
      pagination: buildPaginationMeta({ page, limit, total }),
    });
  } catch (error) {
    console.error("Get wallet history error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Debits the wallet and creates the Withdrawal record atomically, in one
// transaction, so a crash mid-request can never leave a debit without a
// matching Withdrawal (or vice versa).
const requestWithdrawal = async (req, res) => {
  const parsedAmount = Number(req.body.amount);

  if (!Number.isFinite(parsedAmount) || parsedAmount < MINIMUM_WITHDRAWAL_AMOUNT) {
    return res.status(400).json({ message: `Minimum withdrawal amount is ${MINIMUM_WITHDRAWAL_AMOUNT}` });
  }

  if (!req.rider.bankAccountNumber || !req.rider.bankCode) {
    return res.status(400).json({ message: "Add your bank account details to your rider profile first" });
  }

  const existingPending = await WithdrawalModel.exists({ rider: req.rider._id, status: "pending" });
  if (existingPending) {
    return res.status(400).json({ message: "You already have a withdrawal pending review" });
  }

  const session = await mongoose.startSession();

  try {
    let withdrawal;

    await session.withTransaction(async () => {
      const rider = await RiderModel.findById(req.rider._id).session(session);

      if (rider.walletBalance < parsedAmount) {
        throw new Error("INSUFFICIENT_BALANCE");
      }

      const [createdWithdrawal] = await WithdrawalModel.create(
        [
          {
            rider: rider._id,
            amount: parsedAmount,
            bankAccountNumber: rider.bankAccountNumber,
            bankCode: rider.bankCode,
            bankName: rider.bankName,
            bankAccountName: rider.bankAccountName,
          },
        ],
        { session },
      );

      rider.walletBalance -= parsedAmount;
      await rider.save({ session });

      await WalletTransactionModel.create(
        [
          {
            rider: rider._id,
            type: "debit",
            amount: parsedAmount,
            balanceAfter: rider.walletBalance,
            reason: "withdrawal",
            withdrawal: createdWithdrawal._id,
            idempotencyKey: `withdrawal_debit_${createdWithdrawal._id}`,
          },
        ],
        { session },
      );

      withdrawal = createdWithdrawal;
    });

    return res.status(201).json({ message: "Withdrawal requested and pending admin approval", withdrawal });
  } catch (error) {
    if (error.message === "INSUFFICIENT_BALANCE") {
      return res.status(400).json({ message: "Insufficient wallet balance" });
    }
    console.error("Request withdrawal error:", error);
    return res.status(500).json({ message: "Server error" });
  } finally {
    session.endSession();
  }
};

module.exports = { getWallet, getWalletHistory, requestWithdrawal };
