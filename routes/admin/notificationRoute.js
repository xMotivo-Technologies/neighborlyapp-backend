const express = require("express");
const { verifyAdmin } = require("../../middleware/auth");
const { sendPromotion } = require("../../controller/admin/notificationController");

const router = express.Router();

router.post("/notifications/promotion", verifyAdmin, sendPromotion);

module.exports = router;
