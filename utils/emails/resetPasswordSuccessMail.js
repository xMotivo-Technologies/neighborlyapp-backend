const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const resetPasswordSuccessMail = async ({ email }) => {
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: email,
    subject: "Your password was reset",
    html: `<p>Your password was successfully reset. If this wasn't you, contact support immediately.</p>`,
  });
};

module.exports = resetPasswordSuccessMail;
