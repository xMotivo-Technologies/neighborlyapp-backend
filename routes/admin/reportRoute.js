const express = require("express");
const { verifyAdmin } = require("../../middleware/auth");
const { listReports, getReportById, resolveReport } = require("../../controller/admin/reportModeration");

const router = express.Router();

router.get("/reports", verifyAdmin, listReports);
router.get("/reports/:id", verifyAdmin, getReportById);
router.put("/reports/:id/resolve", verifyAdmin, resolveReport);

module.exports = router;
