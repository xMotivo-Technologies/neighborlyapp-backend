const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const accountDeletedMail = async ({ email }) => {
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: email,
    subject: "Your account has been deleted",
    html: `<p>Your Neighborly account has been deleted. If this wasn't you, contact support immediately.</p>`,
  });
};

module.exports = accountDeletedMail;
