const express = require("express");
const { handlePaystackWebhook } = require("../../controller/webhook/paystackWebhookController");

const router = express.Router();

router.post("/webhooks/paystack", handlePaystackWebhook);

module.exports = router;
