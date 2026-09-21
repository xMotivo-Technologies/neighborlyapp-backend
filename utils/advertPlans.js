const AdvertPlanModel = require("../models/AdvertPlan");

const DEFAULT_PLANS = [
  { name: "1 Day", durationDays: 1, price: 500 },
  { name: "7 Days", durationDays: 7, price: 2500 },
  { name: "2 Weeks", durationDays: 14, price: 4000 },
];

// Seeds the three starter plans the first time anyone asks for the plan list,
// so the feature works out of the box. Admin can edit prices/names or add
// more plans afterwards — this never runs again once any plan exists.
const ensureDefaultPlans = async () => {
  const count = await AdvertPlanModel.countDocuments();
  if (count === 0) {
    await AdvertPlanModel.insertMany(DEFAULT_PLANS);
  }
};

module.exports = { ensureDefaultPlans };
