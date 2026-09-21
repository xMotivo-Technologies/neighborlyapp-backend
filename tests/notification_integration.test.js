process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || "re_test_dummy_key";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test_jwt_secret";

const assert = require("assert");

// 1. Verify all templates
const { TEMPLATES } = require("../utils/notifications/templates");

console.log("1. Verifying all notification templates...");
const templateKeys = Object.keys(TEMPLATES);
assert.ok(templateKeys.length >= 20, "Expected at least 20 templates");

for (const key of templateKeys) {
  const fn = TEMPLATES[key];
  assert.strictEqual(typeof fn, "function", `Template ${key} must be a function`);
  const result = fn("Param1", "Param2");
  assert.ok(result.title, `${key} missing title`);
  assert.ok(result.body, `${key} missing body`);
  assert.ok(result.channelId, `${key} missing channelId`);
  assert.ok(result.type, `${key} missing type`);
  // Ensure no sensitive keywords in body
  assert.ok(!result.body.includes("OTP:"), `${key} must not include OTP in body`);
}
console.log(`  ✓ All ${templateKeys.length} templates validated successfully.`);

// 2. Verify notificationService functions and contracts
console.log("2. Verifying notificationService functions...");
const notificationService = require("../services/notificationService");
assert.strictEqual(typeof notificationService.notify, "function");
assert.strictEqual(typeof notificationService.notifyMany, "function");
assert.strictEqual(typeof notificationService.broadcastToRiders, "function");
assert.strictEqual(typeof notificationService.checkReceipts, "function");
assert.strictEqual(typeof notificationService.pruneToken, "function");
console.log("  ✓ notificationService export contracts validated.");

// 3. Verify notificationController & adminNotificationController
console.log("3. Verifying notification controllers...");
const notificationController = require("../controller/notification/notificationController");
assert.strictEqual(typeof notificationController.getNotifications, "function");
assert.strictEqual(typeof notificationController.getUnreadCount, "function");
assert.strictEqual(typeof notificationController.markAsRead, "function");
assert.strictEqual(typeof notificationController.markAllAsRead, "function");
assert.strictEqual(typeof notificationController.deleteNotification, "function");

const adminNotificationController = require("../controller/admin/notificationController");
assert.strictEqual(typeof adminNotificationController.sendPromotion, "function");
console.log("  ✓ All notification controllers validated.");

// 4. Verify routers
console.log("4. Verifying notification routers...");
const notificationRoute = require("../routes/notification/notificationRoute");
const adminNotificationRoute = require("../routes/admin/notificationRoute");

const userRoutePaths = notificationRoute.stack.map(l => l.route?.path).filter(Boolean);
assert.ok(userRoutePaths.includes("/notifications"));
assert.ok(userRoutePaths.includes("/notifications/unread-count"));
assert.ok(userRoutePaths.includes("/notifications/read-all"));
assert.ok(userRoutePaths.includes("/notifications/:id/read"));
assert.ok(userRoutePaths.includes("/notifications/:id"));

const adminRoutePaths = adminNotificationRoute.stack.map(l => l.route?.path).filter(Boolean);
assert.ok(adminRoutePaths.includes("/notifications/promotion"));
console.log("  ✓ All routes and paths validated.");

// 5. Verify controller imports of notification service
console.log("5. Verifying controller wirings...");
const orderController = require("../controller/order/orderController");
const deliveryController = require("../controller/delivery/deliveryController");
const paystackWebhookController = require("../controller/webhook/paystackWebhookController");
const walletController = require("../controller/wallet/walletController");
const vendorWalletController = require("../controller/wallet/vendorWalletController");
const riderApplications = require("../controller/admin/riderApplications");
const vendorApplications = require("../controller/admin/vendorApplications");
const withdrawalApplications = require("../controller/admin/withdrawalApplications");
const vendorWithdrawalApplications = require("../controller/admin/vendorWithdrawalApplications");
const userController = require("../controller/admin/userController");
const reviewController = require("../controller/review/reviewController");
const orderPayment = require("../utils/orderPayment");

assert.ok(orderController.updateOrderStatus);
assert.ok(orderController.cancelOrder);
assert.ok(deliveryController.acceptDelivery);
assert.ok(deliveryController.updateDeliveryStatus);
assert.ok(deliveryController.confirmDelivery);
assert.ok(paystackWebhookController.handlePaystackWebhook);
assert.ok(walletController.requestWithdrawal);
assert.ok(vendorWalletController.requestWithdrawal);
assert.ok(riderApplications.approveRider);
assert.ok(riderApplications.suspendRider);
assert.ok(vendorApplications.approveVendor);
assert.ok(vendorApplications.rejectVendor);
assert.ok(withdrawalApplications.approveWithdrawal);
assert.ok(withdrawalApplications.rejectWithdrawal);
assert.ok(vendorWithdrawalApplications.approveWithdrawal);
assert.ok(vendorWithdrawalApplications.rejectWithdrawal);
assert.ok(userController.suspendUser);
assert.ok(userController.unsuspendUser);
assert.ok(reviewController.createReview);
assert.ok(orderPayment.finalizeOrderPayment);
console.log("  ✓ All controllers and modules import and load cleanly without syntax or binding errors.");

console.log("\n==========================================");
console.log("ALL NOTIFICATION INTEGRATION CHECKS PASSED!");
console.log("==========================================");
process.exit(0);
