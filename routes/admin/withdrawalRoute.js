const express = require("express");
const { verifyAdmin } = require("../../middleware/auth");
const { listWithdrawals, approveWithdrawal, rejectWithdrawal } = require("../../controller/admin/withdrawalApplications");

const router = express.Router();

router.get("/withdrawals", verifyAdmin, listWithdrawals);
router.put("/withdrawals/:id/approve", verifyAdmin, approveWithdrawal);
router.put("/withdrawals/:id/reject", verifyAdmin, rejectWithdrawal);

module.exports = router;
