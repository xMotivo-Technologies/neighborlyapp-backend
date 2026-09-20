const PlatformSettingsModel = require("../models/PlatformSettings");

const SETTINGS_ID = "global";

// Lazily creates the singleton settings document with defaults on first use,
// so the app works out of the box without a manual seed step.
const getPlatformSettings = async () => {
  const settings = await PlatformSettingsModel.findByIdAndUpdate(
    SETTINGS_ID,
    { $setOnInsert: { _id: SETTINGS_ID } },
    { new: true, upsert: true },
  );
  return settings;
};

module.exports = { getPlatformSettings, SETTINGS_ID };
