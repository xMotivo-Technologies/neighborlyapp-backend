const AdvertPlanModel = require("../../models/AdvertPlan");
const { ensureDefaultPlans } = require("../../utils/advertPlans");

// Full list for admin management, including retired (isActive: false) plans.
const listPlans = async (req, res) => {
  try {
    await ensureDefaultPlans();
    const plans = await AdvertPlanModel.find().sort({ durationDays: 1 });
    return res.status(200).json({ data: plans });
  } catch (error) {
    console.error("List advert plans error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const createPlan = async (req, res) => {
  const { name, durationDays, price } = req.body;

  if (!name) {
    return res.status(400).json({ message: "name is required" });
  }

  const parsedDuration = Number(durationDays);
  if (!Number.isFinite(parsedDuration) || parsedDuration < 1) {
    return res.status(400).json({ message: "durationDays must be a number of at least 1" });
  }

  const parsedPrice = Number(price);
  if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
    return res.status(400).json({ message: "price must be a non-negative number" });
  }

  try {
    const plan = await AdvertPlanModel.create({ name, durationDays: parsedDuration, price: parsedPrice });
    return res.status(201).json({ message: "Advert plan created", plan });
  } catch (error) {
    console.error("Create advert plan error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const updatePlan = async (req, res) => {
  const { id } = req.params;
  const { name, durationDays, price, isActive } = req.body;

  try {
    const plan = await AdvertPlanModel.findById(id);
    if (!plan) {
      return res.status(404).json({ message: "Advert plan not found" });
    }

    if (name !== undefined) plan.name = name;

    if (durationDays !== undefined) {
      const parsedDuration = Number(durationDays);
      if (!Number.isFinite(parsedDuration) || parsedDuration < 1) {
        return res.status(400).json({ message: "durationDays must be a number of at least 1" });
      }
      plan.durationDays = parsedDuration;
    }

    if (price !== undefined) {
      const parsedPrice = Number(price);
      if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ message: "price must be a non-negative number" });
      }
      plan.price = parsedPrice;
    }

    if (isActive !== undefined) {
      if (typeof isActive !== "boolean") {
        return res.status(400).json({ message: "isActive must be a boolean" });
      }
      plan.isActive = isActive;
    }

    await plan.save();
    return res.status(200).json({ message: "Advert plan updated", plan });
  } catch (error) {
    console.error("Update advert plan error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const deletePlan = async (req, res) => {
  const { id } = req.params;

  try {
    const plan = await AdvertPlanModel.findByIdAndDelete(id);
    if (!plan) {
      return res.status(404).json({ message: "Advert plan not found" });
    }
    return res.status(200).json({ message: "Advert plan deleted" });
  } catch (error) {
    console.error("Delete advert plan error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = { listPlans, createPlan, updatePlan, deletePlan };
