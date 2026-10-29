const WithdrawalModel = require("../../models/Withdrawal");
const RiderModel = require("../../models/Rider");
const { getPagination, buildPaginationMeta } = require("../../utils/pagination");
const { applyWalletEntry } = require("../../utils/walletLedger");
const { createTransferRecipient, initiateTransfer, verifyTransferByReference } = require("../../utils/paystack");
const { resolveUserIdForRider } = require("../../utils/riderHelper");
const { notify, TEMPLATES } = require("../../services/notificationService");

const listWithdrawals = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    const [withdrawals, total] = await Promise.all([
      WithdrawalModel.find(filter)
        .populate({ path: "rider", populate: { path: "user", select: "firstName lastName email phoneNumber" } })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      WithdrawalModel.countDocuments(filter),
    ]);

    return res.status(200).json({
      data: withdrawals,
      pagination: buildPaginationMeta({ page, limit, total }),
    });
  } catch (error) {
    console.error("List withdrawals error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const reverseWithdrawalDebit = (withdrawal) => {
  return applyWalletEntry({
    riderId: withdrawal.rider,
    type: "credit",
    amount: withdrawal.amount,
    reason: "withdrawal_reversal",
    idempotencyKey: `withdrawal_reversal_${withdrawal._id}`,
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
    // Atomically claim this withdrawal before touching anything irreversible.
    // Without this, two concurrent approve calls (double-click, retry, two
    // admins) could both read status:"pending" and both go on to call
    // Paystack — two real bank transfers for one withdrawal. Whoever loses
    // this race gets null back and backs off before Paystack is ever called.
    const withdrawal = await WithdrawalModel.findOneAndUpdate(
      { _id: id, status: "pending" },
      { status: "processing", reviewedBy: req.admin._id, reviewedAt: new Date() },
      { new: true },
    );

    if (!withdrawal) {
      const existing = await WithdrawalModel.findById(id);
      if (!existing) {
        return res.status(404).json({ message: "Withdrawal not found" });
      }
      return res.status(409).json({ message: `Withdrawal is already ${existing.status}` });
    }

    const rider = await RiderModel.findById(withdrawal.rider);
    if (!rider) {
      // Already claimed as "processing" above — must resolve it one way or
      // the other rather than leaving it stuck there.
      await reverseWithdrawalDebit(withdrawal);
      withdrawal.status = "failed";
      withdrawal.failureReason = "Rider not found";
      await withdrawal.save();
      return res.status(404).json({ message: "Rider not found, withdrawal reversed" });
    }

    let recipientCode = rider.paystackRecipientCode;
    if (!recipientCode) {
      try {
        const recipientResponse = await createTransferRecipient({
          name: withdrawal.bankAccountName,
          account_number: withdrawal.bankAccountNumber,
          bank_code: withdrawal.bankCode,
        });
        recipientCode = recipientResponse.data.recipient_code;
        rider.paystackRecipientCode = recipientCode;
        await rider.save();
      } catch (recipientError) {
        console.error("Create transfer recipient error:", recipientError);
        await reverseWithdrawalDebit(withdrawal);
        withdrawal.status = "failed";
        withdrawal.failureReason = recipientError.message;
        await withdrawal.save();
        return res
          .status(502)
          .json({ message: "Unable to set up payout recipient, withdrawal reversed", withdrawal });
      }
    }

    // Persisted before calling Paystack so a retry after a crash reconciles
    // via this same reference instead of submitting a second transfer.
    if (!withdrawal.transferReference) {
      withdrawal.transferReference = `wd_${withdrawal._id}_${Date.now()}`;
      await withdrawal.save();
    }

    let transferResponse;
    try {
      transferResponse = await initiateTransfer({
        source: "balance",
        amount: Math.round(withdrawal.amount * 100),
        recipient: recipientCode,
        reason: "Rider delivery earnings withdrawal",
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

      const riderUserId = await resolveUserIdForRider(withdrawal.rider);
      if (riderUserId) {
        notify({
          recipientId: riderUserId,
          template: TEMPLATES.RIDER_WITHDRAWAL_APPROVED(),
          data: { withdrawalId: withdrawal._id.toString() },
        });
      }

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
    console.error("Approve withdrawal error:", error);
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
    // Same atomic claim as approveWithdrawal — stops a reject racing another
    // reject (or an approve) from both passing the pending-check.
    const withdrawal = await WithdrawalModel.findOneAndUpdate(
      { _id: id, status: "pending" },
      { status: "rejected", rejectionReason: reason, reviewedBy: req.admin._id, reviewedAt: new Date() },
      { new: true },
    );

    if (!withdrawal) {
      const existing = await WithdrawalModel.findById(id);
      if (!existing) {
        return res.status(404).json({ message: "Withdrawal not found" });
      }
      return res.status(400).json({
        message: `Only a pending withdrawal can be rejected (current status: ${existing.status})`,
      });
    }

    await reverseWithdrawalDebit(withdrawal);

    const riderUserId = await resolveUserIdForRider(withdrawal.rider);
    if (riderUserId) {
      notify({
        recipientId: riderUserId,
        template: TEMPLATES.RIDER_WITHDRAWAL_REJECTED(reason),
        data: { withdrawalId: withdrawal._id.toString(), reason },
      });
    }

    return res.status(200).json({ message: "Withdrawal rejected and funds returned to wallet", withdrawal });
  } catch (error) {
    console.error("Reject withdrawal error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = { listWithdrawals, approveWithdrawal, rejectWithdrawal };
