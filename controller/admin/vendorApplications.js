const UserModel = require("../../models/User");
const { getPagination, buildPaginationMeta } = require("../../utils/pagination");
const { notify, TEMPLATES } = require("../../services/notificationService");

const listPendingVendors = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = { vendorStatus: "pending" };

    const [pendingVendors, total] = await Promise.all([
      UserModel.find(filter).skip(skip).limit(limit),
      UserModel.countDocuments(filter),
    ]);

    return res.status(200).json({
      data: pendingVendors,
      pagination: buildPaginationMeta({ page, limit, total }),
    });
  } catch (error) {
    console.error("List pending vendors error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const listVendors = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = { role: "vendor" };

    const [vendors, total] = await Promise.all([
      UserModel.find(filter).skip(skip).limit(limit),
      UserModel.countDocuments(filter),
    ]);

    return res.status(200).json({
      data: vendors,
      pagination: buildPaginationMeta({ page, limit, total }),
    });
  } catch (error) {
    console.error("List vendors error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const approveVendor = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await UserModel.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.vendorStatus !== "pending") {
      return res.status(400).json({
        message: "User does not have a pending vendor application",
      });
    }

    user.vendorStatus = "approved";
    user.role = "vendor";

    await user.save();

    notify({
      recipientId: user._id,
      template: TEMPLATES.VENDOR_APPLICATION_APPROVED(),
    });

    return res.status(200).json({
      message: "Vendor application approved",
      user: {
        id: user._id,
        role: user.role,
        vendorStatus: user.vendorStatus,
      },
    });
  } catch (error) {
    console.error("Approve vendor error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const rejectVendor = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await UserModel.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.vendorStatus !== "pending") {
      return res.status(400).json({
        message: "User does not have a pending vendor application",
      });
    }

    user.vendorStatus = "rejected";

    await user.save();

    notify({
      recipientId: user._id,
      template: TEMPLATES.VENDOR_APPLICATION_REJECTED(),
    });

    return res.status(200).json({
      message: "Vendor application rejected",
      user: {
        id: user._id,
        role: user.role,
        vendorStatus: user.vendorStatus,
      },
    });
  } catch (error) {
    console.error("Reject vendor error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  listPendingVendors,
  listVendors,
  approveVendor,
  rejectVendor,
};
