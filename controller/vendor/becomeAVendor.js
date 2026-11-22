const UserModel = require("../../models/User");

const becomeAVendor = async (req, res) => {
  const { businessName, businessAddress, storeDescription, phoneNumber } = req.body;

  if (!businessName || !businessAddress) {
    return res.status(400).json({
      message: "Business name and business address are required",
    });
  }

  try {
    const user = await UserModel.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role === "vendor") {
      return res.status(400).json({ message: "User is already a vendor" });
    }

    if (user.vendorStatus === "pending") {
      return res.status(400).json({
        message: "Your vendor application is already pending approval",
      });
    }

    // phoneNumber is optional for a plain buyer account, but a vendor needs
    // to be reachable — accepted directly on the application (rather than
    // requiring a separate PATCH /profile call first) so a buyer with no
    // phone yet can supply one in this same request.
    if (phoneNumber && phoneNumber !== user.phoneNumber) {
      const existingPhone = await UserModel.findOne({ phoneNumber, _id: { $ne: user._id } });
      if (existingPhone) {
        return res.status(400).json({ message: "Phone number already in use" });
      }
      user.phoneNumber = phoneNumber;
    }

    if (!user.phoneNumber) {
      return res.status(400).json({ message: "phoneNumber is required to apply as a vendor" });
    }

    user.businessName = businessName;
    user.businessAddress = businessAddress;
    user.storeDescription = storeDescription;
    user.vendorStatus = "pending";

    await user.save();

    return res.status(200).json({
      message: "Vendor application submitted and pending admin approval",
      user: {
        id: user._id,
        vendorStatus: user.vendorStatus,
        businessName: user.businessName,
        businessAddress: user.businessAddress,
        storeDescription: user.storeDescription,
        phoneNumber: user.phoneNumber,
      },
    });
  } catch (error) {
    console.error("Become a vendor error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  becomeAVendor,
};
