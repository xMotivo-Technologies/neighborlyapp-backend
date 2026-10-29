/**
 * Predefined notification templates for Neighborly.
 *
 * Rules:
 * - Never put exact street addresses, item prices, bank details, or OTPs in push text.
 * - Always return { title, body, channelId, type }.
 */

const TEMPLATES = {
  // Buyer (Customer) Notifications
  PAYMENT_CONFIRMED: () => ({
    title: "Order Confirmed!",
    body: "Your payment was successful and your order has been placed.",
    channelId: "orders",
    type: "order",
  }),
  ORDER_STATUS_UPDATE: (status) => {
    let friendlyStatus = status;
    if (status === "processing") friendlyStatus = "is being prepared";
    else if (status === "shipped") friendlyStatus = "is on its way";
    else if (status === "completed") friendlyStatus = "has been completed";
    else if (status === "cancelled") friendlyStatus = "has been cancelled";

    return {
      title: "Order Update",
      body: `Your order ${friendlyStatus}.`,
      channelId: "orders",
      type: "order",
    };
  },
  ORDER_CANCELLED_BUYER: () => ({
    title: "Order Cancelled",
    body: "Your order has been cancelled successfully.",
    channelId: "orders",
    type: "order",
  }),
  DELIVERY_ACCEPTED: (riderName) => ({
    title: "Rider Assigned 🛵",
    body: `${riderName || "A rider"} has accepted your delivery and is heading to the pickup location.`,
    channelId: "deliveries",
    type: "delivery",
  }),
  DELIVERY_PICKED_UP: () => ({
    title: "Order Picked Up 📦",
    body: "Your order has been picked up from the vendor and is in transit.",
    channelId: "deliveries",
    type: "delivery",
  }),
  DELIVERY_IN_TRANSIT: () => ({
    title: "Order On The Way 🚀",
    body: "Your delivery rider is on the way to your delivery address.",
    channelId: "deliveries",
    type: "delivery",
  }),
  DELIVERY_DELIVERED: () => ({
    title: "Order Delivered 🎉",
    body: "Your delivery has arrived! Please inspect your package and confirm receipt.",
    channelId: "deliveries",
    type: "delivery",
  }),
  DELIVERY_CONFIRMED_BUYER: () => ({
    title: "Order Completed",
    body: "Thank you for confirming your delivery receipt!",
    channelId: "deliveries",
    type: "delivery",
  }),
  DELIVERY_AUTO_CONFIRMED_BUYER: () => ({
    title: "Order Completed",
    body: "We've automatically marked your delivery as received since it's been a few days. Contact support if there was an issue.",
    channelId: "deliveries",
    type: "delivery",
  }),

  // Seller (Vendor) Notifications
  NEW_ORDER_VENDOR: () => ({
    title: "New Order Received! 🛒",
    body: "You have a new customer order waiting to be prepared.",
    channelId: "orders",
    type: "order",
  }),
  ORDER_CANCELLED_VENDOR: () => ({
    title: "Order Cancelled",
    body: "A customer cancelled an order from your store.",
    channelId: "orders",
    type: "order",
  }),
  VENDOR_DELIVERY_PICKED_UP: () => ({
    title: "Order Picked Up",
    body: "A rider has picked up the customer order from your store.",
    channelId: "deliveries",
    type: "delivery",
  }),
  VENDOR_WALLET_CREDIT: () => ({
    title: "Sales Earnings Credited! 💰",
    body: "The customer confirmed delivery! Your earnings have been credited to your wallet.",
    channelId: "wallet",
    type: "wallet",
  }),
  VENDOR_WITHDRAWAL_REQUESTED: () => ({
    title: "Withdrawal Requested",
    body: "Your withdrawal request was received and is pending admin review.",
    channelId: "wallet",
    type: "wallet",
  }),
  VENDOR_WITHDRAWAL_APPROVED: () => ({
    title: "Withdrawal Approved! 💸",
    body: "Your payout has been approved and sent to your bank account.",
    channelId: "wallet",
    type: "wallet",
  }),
  VENDOR_WITHDRAWAL_FAILED: () => ({
    title: "Withdrawal Failed",
    body: "Your payout transfer could not be completed. The funds have been returned to your wallet.",
    channelId: "wallet",
    type: "wallet",
  }),
  VENDOR_WITHDRAWAL_REJECTED: (reason) => ({
    title: "Withdrawal Declined",
    body: reason ? `Your withdrawal was declined: ${reason}. Funds have been returned to your wallet.` : "Your withdrawal request was declined and funds returned to your wallet.",
    channelId: "wallet",
    type: "wallet",
  }),
  VENDOR_APPLICATION_APPROVED: () => ({
    title: "Vendor Account Approved! 🎉",
    body: "Congratulations! Your vendor profile has been approved. You can now list products for sale.",
    channelId: "general",
    type: "account",
  }),
  VENDOR_APPLICATION_REJECTED: () => ({
    title: "Vendor Application Update",
    body: "Your vendor application was reviewed and could not be approved at this time.",
    channelId: "general",
    type: "account",
  }),
  NEW_REVIEW_VENDOR: (reviewerName) => ({
    title: "New Review Received! ⭐",
    body: `${reviewerName || "A customer"} left a review on your store.`,
    channelId: "general",
    type: "review",
  }),

  // Rider Notifications
  DELIVERY_AVAILABLE_RIDER: () => ({
    title: "New Delivery Available! 🛵",
    body: "A new delivery order is available near you. Open the app to view and accept.",
    channelId: "deliveries",
    type: "delivery",
  }),
  RIDER_DELIVERY_ACCEPTED: () => ({
    title: "Delivery Claimed",
    body: "You have accepted the delivery. Proceed to the vendor pickup point.",
    channelId: "deliveries",
    type: "delivery",
  }),
  RIDER_WALLET_CREDIT: () => ({
    title: "Delivery Earnings Credited! 💰",
    body: "Customer confirmed delivery! Your delivery fee has been credited to your wallet.",
    channelId: "wallet",
    type: "wallet",
  }),
  RIDER_WITHDRAWAL_REQUESTED: () => ({
    title: "Withdrawal Requested",
    body: "Your payout request was received and is pending admin approval.",
    channelId: "wallet",
    type: "wallet",
  }),
  RIDER_WITHDRAWAL_APPROVED: () => ({
    title: "Withdrawal Approved! 💸",
    body: "Your delivery payout has been approved and sent to your bank account.",
    channelId: "wallet",
    type: "wallet",
  }),
  RIDER_WITHDRAWAL_FAILED: () => ({
    title: "Withdrawal Failed",
    body: "Your payout transfer failed. Funds have been credited back to your wallet.",
    channelId: "wallet",
    type: "wallet",
  }),
  RIDER_WITHDRAWAL_REJECTED: (reason) => ({
    title: "Withdrawal Declined",
    body: reason ? `Your withdrawal was declined: ${reason}. Funds were returned to your wallet.` : "Your withdrawal request was declined and funds returned to your wallet.",
    channelId: "wallet",
    type: "wallet",
  }),
  RIDER_APPLICATION_APPROVED: () => ({
    title: "Rider Application Approved! 🎉",
    body: "You are approved as a Neighborly rider! Toggle online to start receiving delivery requests.",
    channelId: "general",
    type: "account",
  }),
  RIDER_APPLICATION_SUSPENDED: () => ({
    title: "Rider Account Suspended",
    body: "Your rider access has been suspended. Please contact customer support.",
    channelId: "general",
    type: "account",
  }),

  // General & System
  ACCOUNT_SUSPENDED: () => ({
    title: "Account Suspended",
    body: "Your account has been suspended by an administrator. Please contact support.",
    channelId: "general",
    type: "account",
  }),
  ACCOUNT_UNSUSPENDED: () => ({
    title: "Account Reactivated",
    body: "Your account suspension has been lifted. Welcome back!",
    channelId: "general",
    type: "account",
  }),
  NEW_MESSAGE: (senderName) => ({
    title: "New Message",
    body: `${senderName || "Someone"} sent you a message.`,
    channelId: "messages",
    type: "message",
  }),
  PROMOTION: (title, body) => ({
    title: title || "Special Offer! 🎁",
    body: body || "Check out new trending products and deals in your neighborhood.",
    channelId: "promotions",
    type: "promotion",
  }),
};

module.exports = {
  TEMPLATES,
};
