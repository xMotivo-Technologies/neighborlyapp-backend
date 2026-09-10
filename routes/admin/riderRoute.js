const express = require("express");
const { verifyAdmin } = require("../../middleware/auth");
const { listRiders, getRiderById, approveRider, suspendRider } = require("../../controller/admin/riderApplications");

const router = express.Router();

router.get("/riders", verifyAdmin, listRiders);
router.get("/riders/:id", verifyAdmin, getRiderById);
router.put("/riders/:id/approve", verifyAdmin, approveRider);
router.put("/riders/:id/suspend", verifyAdmin, suspendRider);

module.exports = router;
