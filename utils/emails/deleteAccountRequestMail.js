const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const deleteAccountRequestMail = async ({ email, otp }) => {
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: email,
    subject: "Confirm account deletion",
    html: `<p>Your account deletion confirmation code is <strong>${otp}</strong>. It expires in 15 minutes. If you did not request this, ignore this email and your account will not be affected.</p>`,
  });
};

module.exports = deleteAccountRequestMail;
