const resend = require("./resendClient");

// Shared by both rider and vendor payouts — sent when the Paystack transfer
// itself genuinely failed (as opposed to a reject, which is an admin's own
// decision before any transfer attempt).
const withdrawalFailedMail = async ({ email, firstName, amount }) => {
  const amountPhrase = typeof amount === "number" ? ` of ₦${amount.toLocaleString()}` : "";

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: email,
    subject: "Your withdrawal transfer failed",
    html: `<p>Hi ${firstName || "there"},</p><p>We attempted to send your withdrawal${amountPhrase} but the transfer failed.</p><p>Your funds have been returned to your wallet — please try again or contact support if this keeps happening.</p>`,
  });
};

module.exports = withdrawalFailedMail;
