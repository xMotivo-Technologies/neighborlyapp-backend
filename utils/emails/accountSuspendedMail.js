const resend = require("./resendClient");

const accountSuspendedMail = async ({ email, firstName, reason }) => {
  const reasonPhrase = reason ? ` Reason: ${reason}` : "";

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: email,
    subject: "Your account has been suspended",
    html: `<p>Hi ${firstName || "there"},</p><p>Your Neighborly account has been suspended by an administrator.${reasonPhrase}</p><p>Please contact support if you believe this is a mistake.</p>`,
  });
};

module.exports = accountSuspendedMail;
