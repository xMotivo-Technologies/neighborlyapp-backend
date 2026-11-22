const resend = require("./resendClient");

// Shared by both rider and vendor payouts.
const withdrawalRejectedMail = async ({ email, firstName, amount, reason }) => {
  const amountPhrase = typeof amount === "number" ? ` of ₦${amount.toLocaleString()}` : "";
  const reasonPhrase = reason ? `: ${reason}` : ".";

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: email,
    subject: "Your withdrawal was declined",
    html: `<p>Hi ${firstName || "there"},</p><p>Your withdrawal request${amountPhrase} was declined${reasonPhrase}</p><p>The funds have been returned to your wallet.</p>`,
  });
};

module.exports = withdrawalRejectedMail;
