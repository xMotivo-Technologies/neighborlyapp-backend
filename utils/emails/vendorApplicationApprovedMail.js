const resend = require("./resendClient");

const vendorApplicationApprovedMail = async ({ email, firstName }) => {
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: email,
    subject: "Your vendor application has been approved!",
    html: `<p>Hi ${firstName || "there"},</p><p>Great news — your vendor application on Neighborly has been approved. You can now start listing products for sale.</p><p>Log in to the app to get started.</p>`,
  });
};

module.exports = vendorApplicationApprovedMail;
