const express = require("express");
const { authToken, isVendor } = require("../../middleware/auth");
const {
  getVendorDashboard,
  getVendorAnalytics,
  getProductAnalytics,
} = require("../../controller/vendor/vendorAnalyticsController");

const router = express.Router();

router.get("/vendor/dashboard", authToken, isVendor, getVendorDashboard);
router.get("/vendor/analytics", authToken, isVendor, getVendorAnalytics);
router.get("/vendor/products/:id/analytics", authToken, isVendor, getProductAnalytics);

module.exports = router;
