const crypto = require("crypto");
const WithdrawalModel = require("../../models/Withdrawal");
const VendorWithdrawalModel = require("../../models/VendorWithdrawal");
const { applyWalletEntry } = require("../../utils/walletLedger");
const { applyVendorWalletEntry } = require("../../utils/vendorWalletLedger");
const { finalizeOrderPayment } = require("../../utils/orderPayment");
const { resolveUserIdForRider } = require("../../utils/riderHelper");
const { notify, TEMPLATES } = require("../../services/notificationService");

const TERMINAL_STATUSES = ["approved", "rejected", "failed"];

const finalizeWithdrawalTransfer = async (reference, outcome, paystackData) => {
  if (!reference) return;

  // A transfer reference belongs to either a rider withdrawal or a vendor
  // withdrawal — check both since Paystack's webhook doesn't say which.
  const withdrawal = await WithdrawalModel.findOne({ transferReference: reference });
  if (withdrawal) {
    return finalizeRiderWithdrawal(withdrawal, outcome, paystackData);
  }

  const vendorWithdrawal = await VendorWithdrawalModel.findOne({ transferReference: reference });
  if (vendorWithdrawal) {
    return finalizeVendorWithdrawal(vendorWithdrawal, outcome, paystackData);
  }
};

const finalizeRiderWithdrawal = async (withdrawal, outcome, paystackData) => {
  if (TERMINAL_STATUSES.includes(withdrawal.status)) return; // already finalized

  withdrawal.paystackStatus = paystackData.status;
  withdrawal.transferCode = paystackData.transfer_code || withdrawal.transferCode;

  const riderUserId = await resolveUserIdForRider(withdrawal.rider);

  if (outcome === "success") {
    withdrawal.status = "approved";
    await withdrawal.save();

    if (riderUserId) {
      notify({
        recipientId: riderUserId,
        template: TEMPLATES.RIDER_WITHDRAWAL_APPROVED(),
        data: { withdrawalId: withdrawal._id.toString() },
      });
    }
    return;
  }

  await applyWalletEntry({
    riderId: withdrawal.rider,
    type: "credit",
    amount: withdrawal.amount,
    reason: "withdrawal_reversal",
    idempotencyKey: `withdrawal_reversal_${withdrawal._id}`,
    withdrawal: withdrawal._id,
  });

  withdrawal.status = "failed";
  withdrawal.failureReason = paystackData.message || "Transfer failed";
  await withdrawal.save();

  if (riderUserId) {
    notify({
      recipientId: riderUserId,
      template: TEMPLATES.RIDER_WITHDRAWAL_FAILED(),
      data: { withdrawalId: withdrawal._id.toString(), reason: withdrawal.failureReason },
    });
  }
};

const finalizeVendorWithdrawal = async (withdrawal, outcome, paystackData) => {
  if (TERMINAL_STATUSES.includes(withdrawal.status)) return; // already finalized

  withdrawal.paystackStatus = paystackData.status;
  withdrawal.transferCode = paystackData.transfer_code || withdrawal.transferCode;

  if (outcome === "success") {
    withdrawal.status = "approved";
    await withdrawal.save();

    notify({
      recipientId: withdrawal.vendor,
      template: TEMPLATES.VENDOR_WITHDRAWAL_APPROVED(),
      data: { withdrawalId: withdrawal._id.toString() },
    });
    return;
  }

  await applyVendorWalletEntry({
    vendorId: withdrawal.vendor,
    type: "credit",
    amount: withdrawal.amount,
    reason: "withdrawal_reversal",
    idempotencyKey: `vendor_withdrawal_reversal_${withdrawal._id}`,
    withdrawal: withdrawal._id,
  });

  withdrawal.status = "failed";
  withdrawal.failureReason = paystackData.message || "Transfer failed";
  await withdrawal.save();

  notify({
    recipientId: withdrawal.vendor,
    template: TEMPLATES.VENDOR_WITHDRAWAL_FAILED(),
    data: { withdrawalId: withdrawal._id.toString(), reason: withdrawal.failureReason },
  });
};

// Requires req.rawBody (captured by the express.json verify callback in
// index.js) since signature verification needs the exact bytes Paystack sent.
const handlePaystackWebhook = async (req, res) => {
  const signature = req.headers["x-paystack-signature"];
  const expectedSignature = crypto
    .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
    .update(req.rawBody || Buffer.from(""))
    .digest("hex");

  if (!signature || signature !== expectedSignature) {
    return res.status(401).json({ message: "Invalid signature" });
  }

  // Acknowledge immediately; Paystack retries on non-2xx and we don't want a
  // slow/failed downstream write to trigger duplicate webhook delivery storms.
  res.status(200).json({ received: true });

  const event = req.body;

  try {
    if (event.event === "charge.success") {
      if (event.data?.status === "success" && event.data?.reference) {
        await finalizeOrderPayment({
          paymentReference: event.data.reference,
          transactionData: event.data,
        });
      }
    } else if (event.event === "transfer.success") {
      await finalizeWithdrawalTransfer(event.data.reference, "success", event.data);
    } else if (event.event === "transfer.failed" || event.event === "transfer.reversed") {
      await finalizeWithdrawalTransfer(event.data.reference, "failed", event.data);
    }
  } catch (error) {
    console.error("Paystack webhook processing error:", error);
  }
};

module.exports = { handlePaystackWebhook };
