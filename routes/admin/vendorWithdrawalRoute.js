const express = require("express");
const { verifyAdmin } = require("../../middleware/auth");
const {
  listWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
} = require("../../controller/admin/vendorWithdrawalApplications");

const router = express.Router();

router.get("/vendor-withdrawals", verifyAdmin, listWithdrawals);
router.put("/vendor-withdrawals/:id/approve", verifyAdmin, approveWithdrawal);
router.put("/vendor-withdrawals/:id/reject", verifyAdmin, rejectWithdrawal);

module.exports = router;
