const express = require("express");
const { verifyAdmin } = require("../../middleware/auth");
const {
  listPendingVendors,
  listVendors,
  approveVendor,
  rejectVendor,
} = require("../../controller/admin/vendorApplications");
const { listUsers } = require("../../controller/admin/userController");

const router = express.Router();

router.get("/vendors/pending", verifyAdmin, listPendingVendors);
router.get("/vendors", verifyAdmin, listVendors);
router.patch("/vendors/:userId/approve", verifyAdmin, approveVendor);
router.patch("/vendors/:userId/reject", verifyAdmin, rejectVendor);
router.get("/users", verifyAdmin, listUsers);

module.exports = router;
