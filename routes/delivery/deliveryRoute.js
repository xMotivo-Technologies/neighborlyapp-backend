const express = require("express");
const { authToken, isRider } = require("../../middleware/auth");
const {
  estimateDelivery,
  acceptDelivery,
  getDeliveryById,
  updateDeliveryStatus,
  confirmDelivery,
  getDeliveryTracking,
} = require("../../controller/delivery/deliveryController");

const router = express.Router();

router.post("/deliveries/estimate", authToken, estimateDelivery);
router.post("/deliveries/:id/accept", authToken, isRider, acceptDelivery);
router.get("/deliveries/:id", authToken, getDeliveryById);
router.put("/deliveries/:id/status", authToken, isRider, updateDeliveryStatus);
router.post("/deliveries/:id/confirm", authToken, confirmDelivery);
router.get("/deliveries/:id/tracking", authToken, getDeliveryTracking);

module.exports = router;
