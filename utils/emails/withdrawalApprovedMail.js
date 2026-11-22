const resend = require("./resendClient");

// Shared by both rider and vendor payouts — the wording is generic enough
// to apply to either ("your withdrawal", not "your delivery earnings").
const withdrawalApprovedMail = async ({ email, firstName, amount }) => {
  const amountPhrase = typeof amount === "number" ? ` of ₦${amount.toLocaleString()}` : "";

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: email,
    subject: "Your withdrawal has been approved 💸",
    html: `<p>Hi ${firstName || "there"},</p><p>Your withdrawal${amountPhrase} has been approved and sent to your bank account.</p>`,
  });
};

module.exports = withdrawalApprovedMail;
