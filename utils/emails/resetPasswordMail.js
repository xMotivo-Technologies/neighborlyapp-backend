const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const resetPasswordMail = async ({ email, otp }) => {
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: email,
    subject: "Reset your password",
    html: `<p>Your password reset code is <strong>${otp}</strong>. It expires in 15 minutes.</p>`,
  });
};

module.exports = resetPasswordMail;
