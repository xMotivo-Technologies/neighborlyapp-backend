const resend = require("./resendClient");

const accountBannedMail = async ({ email, firstName, reason }) => {
  const reasonPhrase = reason ? ` Reason: ${reason}` : "";

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: email,
    subject: "Your account has been banned",
    html: `<p>Hi ${firstName || "there"},</p><p>Your Neighborly account has been banned by an administrator.${reasonPhrase}</p><p>If you believe this is a mistake, please contact support.</p>`,
  });
};

module.exports = accountBannedMail;
