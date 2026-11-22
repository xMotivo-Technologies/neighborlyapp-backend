const resend = require("./resendClient");

const vendorApplicationRejectedMail = async ({ email, firstName }) => {
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: email,
    subject: "Update on your vendor application",
    html: `<p>Hi ${firstName || "there"},</p><p>We've reviewed your vendor application on Neighborly and it could not be approved at this time.</p><p>You're welcome to update your details and re-apply, or contact support if you have questions.</p>`,
  });
};

module.exports = vendorApplicationRejectedMail;
