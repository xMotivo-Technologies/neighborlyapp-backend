const resend = require("./resendClient");

// Sent to the vendor when they receive a new customer order.
const newOrderMail = async ({ email, firstName, orderId }) => {
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: email,
    subject: "You have a new order! 🛒",
    html: `<p>Hi ${firstName || "there"},</p><p>You've received a new order (Order ID: ${orderId}). Log in to the app to start preparing it.</p>`,
  });
};

module.exports = newOrderMail;
