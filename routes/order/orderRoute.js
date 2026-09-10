const express = require("express");
const { authToken, isVendor } = require("../../middleware/auth");
const {
  createOrder,
  verifyPayment,
  getMyOrders,
  getVendorOrders,
  getOrderById,
  updateOrderStatus,
  cancelOrder,
} = require("../../controller/order/orderController");

const router = express.Router();

router.post("/orders", authToken, createOrder);
router.get("/orders", authToken, getMyOrders);
router.get("/vendor/orders", authToken, isVendor, getVendorOrders);
router.get("/orders/:id", authToken, getOrderById);
router.put("/orders/:id/status", authToken, isVendor, updateOrderStatus);
router.put("/orders/:id/cancel", authToken, cancelOrder);
router.post("/verify-payment", authToken, verifyPayment);

module.exports = router;
