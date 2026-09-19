const express = require("express");
const { verifyAdmin } = require("../../middleware/auth");
const { getDashboard, getAnalytics } = require("../../controller/admin/dashboardController");

const router = express.Router();

router.get("/dashboard", verifyAdmin, getDashboard);
router.get("/analytics", verifyAdmin, getAnalytics);

module.exports = router;
