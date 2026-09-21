const { getPlatformSettings, SETTINGS_ID } = require("../../utils/platformSettings");
const PlatformSettingsModel = require("../../models/PlatformSettings");

const getSettings = async (req, res) => {
  try {
    const settings = await getPlatformSettings();
    return res.status(200).json({ settings });
  } catch (error) {
    console.error("Get settings error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Only these fields are editable here. Percent fields must be 0-100,
// advertRadiusKm must be positive — the schema validates the same ranges,
// this just rejects bad input up front with a clear message.
const updateSettings = async (req, res) => {
  const { productCommissionPercent, deliveryCommissionPercent, advertRadiusKm } = req.body;
  const update = {};

  if (productCommissionPercent !== undefined) {
    const value = Number(productCommissionPercent);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return res.status(400).json({ message: "productCommissionPercent must be a number between 0 and 100" });
    }
    update.productCommissionPercent = value;
  }

  if (deliveryCommissionPercent !== undefined) {
    const value = Number(deliveryCommissionPercent);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return res.status(400).json({ message: "deliveryCommissionPercent must be a number between 0 and 100" });
    }
    update.deliveryCommissionPercent = value;
  }

  if (advertRadiusKm !== undefined) {
    const value = Number(advertRadiusKm);
    if (!Number.isFinite(value) || value <= 0) {
      return res.status(400).json({ message: "advertRadiusKm must be a positive number" });
    }
    update.advertRadiusKm = value;
  }

  if (Object.keys(update).length === 0) {
    return res.status(400).json({
      message: "Provide at least one of productCommissionPercent, deliveryCommissionPercent, advertRadiusKm",
    });
  }

  update.updatedBy = req.admin._id;

  try {
    const settings = await PlatformSettingsModel.findByIdAndUpdate(SETTINGS_ID, update, {
      new: true,
      upsert: true,
    });
    return res.status(200).json({ message: "Settings updated", settings });
  } catch (error) {
    console.error("Update settings error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = { getSettings, updateSettings };
