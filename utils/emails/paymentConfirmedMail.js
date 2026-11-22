const resend = require("./resendClient");

// Sent to the buyer once their payment is confirmed — a receipt, not a
// delivery-status update (those have their own notifications already).
const paymentConfirmedMail = async ({ email, firstName, orderId, totalAmount }) => {
  const amountText = typeof totalAmount === "number" ? `₦${totalAmount.toLocaleString()}` : null;

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: email,
    subject: "Your order is confirmed!",
    html: `<p>Hi ${firstName || "there"},</p><p>Thanks for your order! We've received your payment${amountText ? ` of ${amountText}` : ""} for order ${orderId}.</p><p>We'll let you know as it's prepared and sent out for delivery.</p>`,
  });
};

module.exports = paymentConfirmedMail;
