const resend = require("./resendClient");

const riderApplicationApprovedMail = async ({ email, firstName }) => {
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: email,
    subject: "You're approved as a Neighborly rider!",
    html: `<p>Hi ${firstName || "there"},</p><p>You're approved as a Neighborly rider! Open the app and toggle online to start receiving delivery requests.</p>`,
  });
};

module.exports = riderApplicationApprovedMail;
