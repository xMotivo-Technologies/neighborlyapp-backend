const VendorWithdrawalModel = require("../../models/VendorWithdrawal");
const UserModel = require("../../models/User");
const { getPagination, buildPaginationMeta } = require("../../utils/pagination");
const { applyVendorWalletEntry } = require("../../utils/vendorWalletLedger");
const { createTransferRecipient, initiateTransfer, verifyTransferByReference } = require("../../utils/paystack");
const { notify, TEMPLATES } = require("../../services/notificationService");

// Mirrors controller/admin/withdrawalApplications.js (the rider withdrawal
// admin flow) but for vendors.

const listWithdrawals = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    const [withdrawals, total] = await Promise.all([
      VendorWithdrawalModel.find(filter)
        .populate("vendor", "firstName lastName email phoneNumber businessName")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      VendorWithdrawalModel.countDocuments(filter),
    ]);

    return res.status(200).json({
      data: withdrawals,
      pagination: buildPaginationMeta({ page, limit, total }),
    });
  } catch (error) {
    console.error("List vendor withdrawals error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const reverseWithdrawalDebit = (withdrawal) => {
  return applyVendorWalletEntry({
    vendorId: withdrawal.vendor,
    type: "credit",
    amount: withdrawal.amount,
    reason: "withdrawal_reversal",
    idempotencyKey: `vendor_withdrawal_reversal_${withdrawal._id}`,
    withdrawal: withdrawal._id,
  });
};

// Kicks off the Paystack transfer. This does not guarantee final settlement —
// a live transfer typically resolves asynchronously via the transfer.success
// / transfer.failed webhook (see routes/webhook), which moves the withdrawal
// from "processing" to its terminal state.
const approveWithdrawal = async (req, res) => {
  const { id } = req.params;

  try {
    const withdrawal = await VendorWithdrawalModel.findById(id);

    if (!withdrawal) {
      return res.status(404).json({ message: "Withdrawal not found" });
    }

    if (withdrawal.status !== "pending") {
      return res.status(400).json({ message: `Withdrawal is already ${withdrawal.status}` });
    }

    const vendor = await UserModel.findById(withdrawal.vendor);
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    let recipientCode = vendor.paystackRecipientCode;
    if (!recipientCode) {
      const recipientResponse = await createTransferRecipient({
        name: withdrawal.bankAccountName,
        account_number: withdrawal.bankAccountNumber,
        bank_code: withdrawal.bankCode,
      });
      recipientCode = recipientResponse.data.recipient_code;
      vendor.paystackRecipientCode = recipientCode;
      await vendor.save();
    }

    // Persisted before calling Paystack so a retry after a crash reconciles
    // via this same reference instead of submitting a second transfer.
    if (!withdrawal.transferReference) {
      withdrawal.transferReference = `vwd_${withdrawal._id}_${Date.now()}`;
      await withdrawal.save();
    }

    let transferResponse;
    try {
      transferResponse = await initiateTransfer({
        source: "balance",
        amount: Math.round(withdrawal.amount * 100),
        recipient: recipientCode,
        reason: "Vendor sales earnings withdrawal",
        reference: withdrawal.transferReference,
      });
    } catch (transferError) {
      console.error("Initiate transfer error:", transferError);

      // The reference may have gone through even though this call errored
      // (e.g. we lost the response) — check before assuming it failed.
      let verified = null;
      try {
        verified = await verifyTransferByReference(withdrawal.transferReference);
      } catch (verifyError) {
        console.error("Verify transfer error:", verifyError);
      }

      if (verified?.data?.status === "success") {
        withdrawal.status = "approved";
        withdrawal.paystackStatus = "success";
        withdrawal.transferCode = verified.data.transfer_code;
        withdrawal.reviewedBy = req.admin._id;
        withdrawal.reviewedAt = new Date();
        await withdrawal.save();
        return res.status(200).json({ message: "Withdrawal approved", withdrawal });
      }

      if (verified?.data?.status === "pending" || verified?.data?.status === "otp") {
        withdrawal.status = "processing";
        withdrawal.paystackStatus = verified.data.status;
        withdrawal.reviewedBy = req.admin._id;
        withdrawal.reviewedAt = new Date();
        await withdrawal.save();
        return res.status(202).json({ message: "Transfer submitted, awaiting confirmation", withdrawal });
      }

      // Genuinely never went through — reverse the earlier debit.
      await reverseWithdrawalDebit(withdrawal);
      withdrawal.status = "failed";
      withdrawal.failureReason = transferError.message;
      await withdrawal.save();
      return res.status(502).json({ message: "Unable to initiate transfer, withdrawal reversed", withdrawal });
    }

    const { data } = transferResponse;
    withdrawal.transferCode = data.transfer_code;
    withdrawal.paystackStatus = data.status;
    withdrawal.reviewedBy = req.admin._id;
    withdrawal.reviewedAt = new Date();

    if (data.status === "success") {
      withdrawal.status = "approved";
      await withdrawal.save();

      notify({
        recipientId: withdrawal.vendor,
        template: TEMPLATES.VENDOR_WITHDRAWAL_APPROVED(),
        data: { withdrawalId: withdrawal._id.toString() },
      });

      return res.status(200).json({ message: "Withdrawal approved and transfer completed", withdrawal });
    }

    if (data.status === "otp") {
      withdrawal.status = "processing";
      await withdrawal.save();
      return res.status(202).json({
        message:
          "Transfer requires OTP confirmation on the Paystack dashboard. Disable 'Confirm transfers before sending' under Transfer Preferences to automate this.",
        withdrawal,
      });
    }

    // "pending" — normal for live transfers; webhook finalizes it.
    withdrawal.status = "processing";
    await withdrawal.save();
    return res.status(202).json({ message: "Transfer submitted, awaiting bank confirmation", withdrawal });
  } catch (error) {
    console.error("Approve vendor withdrawal error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Only a still-pending (never submitted to Paystack) withdrawal can be
// rejected here — once a transfer is in flight it must resolve via Paystack's
// own outcome, not be cancelled from our side.
const rejectWithdrawal = async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  try {
    const withdrawal = await VendorWithdrawalModel.findById(id);

    if (!withdrawal) {
      return res.status(404).json({ message: "Withdrawal not found" });
    }

    if (withdrawal.status !== "pending") {
      return res.status(400).json({
        message: `Only a pending withdrawal can be rejected (current status: ${withdrawal.status})`,
      });
    }

    await reverseWithdrawalDebit(withdrawal);

    withdrawal.status = "rejected";
    withdrawal.rejectionReason = reason;
    withdrawal.reviewedBy = req.admin._id;
    withdrawal.reviewedAt = new Date();
    await withdrawal.save();

    notify({
      recipientId: withdrawal.vendor,
      template: TEMPLATES.VENDOR_WITHDRAWAL_REJECTED(reason),
      data: { withdrawalId: withdrawal._id.toString(), reason },
    });

    return res.status(200).json({ message: "Withdrawal rejected and funds returned to wallet", withdrawal });
  } catch (error) {
    console.error("Reject vendor withdrawal error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = { listWithdrawals, approveWithdrawal, rejectWithdrawal };
