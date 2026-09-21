const express = require("express");
const { verifyAdmin } = require("../../middleware/auth");
const { listPlans, createPlan, updatePlan, deletePlan } = require("../../controller/admin/advertPlanController");

const router = express.Router();

router.get("/advert-plans", verifyAdmin, listPlans);
router.post("/advert-plans", verifyAdmin, createPlan);
router.put("/advert-plans/:id", verifyAdmin, updatePlan);
router.delete("/advert-plans/:id", verifyAdmin, deletePlan);

module.exports = router;
