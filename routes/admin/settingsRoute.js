const express = require("express");
const { verifyAdmin } = require("../../middleware/auth");
const { getSettings, updateSettings } = require("../../controller/admin/settingsController");

const router = express.Router();

router.get("/settings", verifyAdmin, getSettings);
router.put("/settings", verifyAdmin, updateSettings);

module.exports = router;
