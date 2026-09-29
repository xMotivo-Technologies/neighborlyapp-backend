const mongoose = require("mongoose");
const UserModel = require("../../models/User");
const VendorWalletTransactionModel = require("../../models/VendorWalletTransaction");
const VendorWithdrawalModel = require("../../models/VendorWithdrawal");
const { getPagination, buildPaginationMeta } = require("../../utils/pagination");
const { listBanks, resolveAccountNumber } = require("../../utils/paystack");
const { notify, TEMPLATES } = require("../../services/notificationService");

const MINIMUM_WITHDRAWAL_AMOUNT = 500;

// req.user is a vendor here (isVendor middleware already ran).
const getWallet = async (req, res) => {
  return res.status(200).json({
    balance: req.user.walletBalance,
    currency: "NGN",
    bankAccountNumber: req.user.bankAccountNumber,
    bankName: req.user.bankName,
    bankAccountName: req.user.bankAccountName,
  });
};

const getWalletHistory = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = { vendor: req.user._id };
    if (req.query.type) filter.type = req.query.type;

    const [transactions, total] = await Promise.all([
      VendorWalletTransactionModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      VendorWalletTransactionModel.countDocuments(filter),
    ]);

    return res.status(200).json({
      data: transactions,
      pagination: buildPaginationMeta({ page, limit, total }),
    });
  } catch (error) {
    console.error("Get vendor wallet history error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Bank details are always re-verified against Paystack here — the account
// name shown/stored is never taken from the client's own say-so. Mirrors
// updateRiderProfile's bank-resolution flow.
const updateVendorBankDetails = async (req, res) => {
  const { accountNumber, bankCode } = req.body;

  if (!accountNumber || !bankCode) {
    return res.status(400).json({ message: "accountNumber and bankCode are required" });
  }

  try {
    const { data: banks } = await listBanks();
    const bank = banks.find((b) => b.code === bankCode);

    if (!bank) {
      return res.status(400).json({ message: "Invalid bankCode" });
    }

    let resolved;
    try {
      resolved = await resolveAccountNumber({ account_number: accountNumber, bank_code: bankCode });
    } catch (resolveError) {
      console.error("Resolve account number error:", resolveError);
      return res.status(400).json({ message: "Could not verify this account number with the selected bank" });
    }

    req.user.bankAccountNumber = accountNumber;
    req.user.bankCode = bankCode;
    req.user.bankName = bank.name;
    req.user.bankAccountName = resolved.data.account_name;
    req.user.paystackRecipientCode = undefined; // invalidate cache; recreated lazily on next withdrawal
    await req.user.save();

    return res.status(200).json({
      message: "Bank details updated",
      bankAccountNumber: req.user.bankAccountNumber,
      bankName: req.user.bankName,
      bankAccountName: req.user.bankAccountName,
    });
  } catch (error) {
    console.error("Update vendor bank details error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Debits the wallet and creates the VendorWithdrawal record atomically, in one
// transaction, so a crash mid-request can never leave a debit without a
// matching VendorWithdrawal (or vice versa). Mirrors requestWithdrawal in
// controller/wallet/walletController.js.
const requestWithdrawal = async (req, res) => {
  const parsedAmount = Number(req.body.amount);

  if (!Number.isFinite(parsedAmount) || parsedAmount < MINIMUM_WITHDRAWAL_AMOUNT) {
    return res.status(400).json({ message: `Minimum withdrawal amount is ${MINIMUM_WITHDRAWAL_AMOUNT}` });
  }

  if (!req.user.bankAccountNumber || !req.user.bankCode) {
    return res.status(400).json({ message: "Add your bank account details first" });
  }

  const existingPending = await VendorWithdrawalModel.exists({ vendor: req.user._id, status: "pending" });
  if (existingPending) {
    return res.status(400).json({ message: "You already have a withdrawal pending review" });
  }

  const session = await mongoose.startSession();

  try {
    let withdrawal;

    await session.withTransaction(async () => {
      const vendor = await UserModel.findById(req.user._id).session(session);

      if (vendor.walletBalance < parsedAmount) {
        throw new Error("INSUFFICIENT_BALANCE");
      }

      const [createdWithdrawal] = await VendorWithdrawalModel.create(
        [
          {
            vendor: vendor._id,
            amount: parsedAmount,
            bankAccountNumber: vendor.bankAccountNumber,
            bankCode: vendor.bankCode,
            bankName: vendor.bankName,
            bankAccountName: vendor.bankAccountName,
          },
        ],
        { session },
      );

      vendor.walletBalance -= parsedAmount;
      await vendor.save({ session });

      await VendorWalletTransactionModel.create(
        [
          {
            vendor: vendor._id,
            type: "debit",
            amount: parsedAmount,
            balanceAfter: vendor.walletBalance,
            reason: "withdrawal",
            withdrawal: createdWithdrawal._id,
            idempotencyKey: `vendor_withdrawal_debit_${createdWithdrawal._id}`,
          },
        ],
        { session },
      );

      withdrawal = createdWithdrawal;
    });

    if (withdrawal) {
      notify({
        recipientId: req.user._id,
        template: TEMPLATES.VENDOR_WITHDRAWAL_REQUESTED(),
        data: { withdrawalId: withdrawal._id.toString(), audience: "vendor" },
      });
    }

    return res.status(201).json({ message: "Withdrawal requested and pending admin approval", withdrawal });
  } catch (error) {
    if (error.message === "INSUFFICIENT_BALANCE") {
      return res.status(400).json({ message: "Insufficient wallet balance" });
    }
    console.error("Request vendor withdrawal error:", error);
    return res.status(500).json({ message: "Server error" });
  } finally {
    session.endSession();
  }
};

module.exports = { getWallet, getWalletHistory, updateVendorBankDetails, requestWithdrawal };
