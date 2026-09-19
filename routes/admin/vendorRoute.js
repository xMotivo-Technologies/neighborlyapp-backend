const express = require("express");
const { verifyAdmin } = require("../../middleware/auth");
const {
  listPendingVendors,
  listVendors,
  approveVendor,
  rejectVendor,
} = require("../../controller/admin/vendorApplications");

const router = express.Router();

router.get("/vendors/pending", verifyAdmin, listPendingVendors);
router.get("/vendors", verifyAdmin, listVendors);
router.patch("/vendors/:userId/approve", verifyAdmin, approveVendor);
router.patch("/vendors/:userId/reject", verifyAdmin, rejectVendor);

module.exports = router;
