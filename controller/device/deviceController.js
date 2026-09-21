const { Expo } = require("expo-server-sdk");
const DeviceTokenModel = require("../../models/DeviceToken");
const UserModel = require("../../models/User");

const registerDevice = async (req, res) => {
  const { token, pushToken, deviceType } = req.body;
  const expoToken = token || pushToken;

  if (!expoToken) {
    return res.status(400).json({ message: "Push token is required" });
  }

  if (!Expo.isExpoPushToken(expoToken)) {
    return res.status(400).json({ message: "Invalid Expo push token" });
  }

  try {
    const validDeviceType = ["android", "ios", "web", "unknown"].includes(deviceType)
      ? deviceType
      : "unknown";

    await Promise.all([
      DeviceTokenModel.findOneAndUpdate(
        { token: expoToken },
        { user: req.user._id, deviceType: validDeviceType, lastActive: new Date() },
        { upsert: true, new: true }
      ),
      UserModel.findByIdAndUpdate(req.user._id, {
        $addToSet: { expoTokens: expoToken },
      }),
    ]);

    return res.status(200).json({
      message: "Device registered successfully",
      token: expoToken,
    });
  } catch (error) {
    console.error("Register device error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const removeDevice = async (req, res) => {
  const token = req.body.token || req.body.pushToken || req.query.token || req.query.pushToken;

  if (!token) {
    return res.status(400).json({ message: "Push token is required" });
  }

  try {
    await Promise.all([
      DeviceTokenModel.deleteOne({ token, user: req.user._id }),
      UserModel.findByIdAndUpdate(req.user._id, {
        $pull: { expoTokens: token },
      }),
    ]);

    return res.status(200).json({ message: "Device unregistered successfully" });
  } catch (error) {
    console.error("Remove device error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  registerDevice,
  removeDevice,
};
