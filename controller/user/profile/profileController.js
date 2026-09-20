const UserModel = require("../../../models/User");

// req.user is populated by the authToken middleware and already excludes
// select:false fields (hashPass, otp, transactionPin, refreshToken, etc).
const getUserProfile = async (req, res) => {
  try {
    return res.status(200).json({ user: req.user });
  } catch (error) {
    console.error("Get user profile error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const updateProfile = async (req, res) => {
  const { firstName, lastName, phoneNumber, businessName, businessAddress, storeDescription, notificationsEnabled } = req.body;

  try {
    const user = await UserModel.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (phoneNumber !== undefined && phoneNumber !== user.phoneNumber) {
      const existingPhone = await UserModel.findOne({ phoneNumber, _id: { $ne: user._id } });
      if (existingPhone) {
        return res.status(400).json({ message: "Phone number already in use" });
      }
      user.phoneNumber = phoneNumber;
    }

    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (notificationsEnabled !== undefined) user.notificationsEnabled = notificationsEnabled;

    // Vendor-only fields — editing an existing vendor profile, not applying to become one.
    if (user.role === "vendor") {
      if (businessName !== undefined) user.businessName = businessName;
      if (businessAddress !== undefined) user.businessAddress = businessAddress;
      if (storeDescription !== undefined) user.storeDescription = storeDescription;
    }

    await user.save();

    return res.status(200).json({ message: "Profile updated", user });
  } catch (error) {
    console.error("Update profile error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = { getUserProfile, updateProfile };
