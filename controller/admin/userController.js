const UserModel = require("../../models/User");
const OrderModel = require("../../models/Order");
const ProductModel = require("../../models/Products");
const { getPagination, buildPaginationMeta } = require("../../utils/pagination");
const { sendPasswordResetOtp } = require("../auth/resetPasswordController");
const { notify, TEMPLATES } = require("../../services/notificationService");

const listUsers = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const { role, status, search } = req.query;

    const filter = {};
    if (role) filter.role = role;
    if (status) filter.status = status;
    if (search) {
      const regex = new RegExp(search, "i");
      filter.$or = [{ firstName: regex }, { lastName: regex }, { email: regex }, { phoneNumber: regex }];
    }

    const [users, total] = await Promise.all([
      UserModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      UserModel.countDocuments(filter),
    ]);

    return res.status(200).json({
      data: users,
      pagination: buildPaginationMeta({ page, limit, total }),
    });
  } catch (error) {
    console.error("List users error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const getUserById = async (req, res) => {
  const { id } = req.params;

  try {
    const user = await UserModel.findById(id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const [ordersAsBuyerCount, productsCount] = await Promise.all([
      OrderModel.countDocuments({ buyer: id }),
      user.role === "vendor" ? ProductModel.countDocuments({ vendor: id }) : Promise.resolve(0),
    ]);

    return res.status(200).json({ user, stats: { ordersAsBuyerCount, productsCount } });
  } catch (error) {
    console.error("Get user error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Kills the refresh token too so a long-lived session can't outlive the
// suspension — the access token dies on its own within minutes since
// authToken now rejects any non-"active" user on every request.
const suspendUser = async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  try {
    const user = await UserModel.findById(id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.status === "suspended") {
      return res.status(400).json({ message: "User is already suspended" });
    }

    user.status = "suspended";
    user.suspendedAt = new Date();
    user.suspendReason = reason;
    user.refreshToken = null;
    await user.save();

    notify({
      recipientId: user._id,
      template: TEMPLATES.ACCOUNT_SUSPENDED(),
      data: { audience: "buyer" },
    });

    return res.status(200).json({ message: "User suspended", user });
  } catch (error) {
    console.error("Suspend user error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const unsuspendUser = async (req, res) => {
  const { id } = req.params;

  try {
    const user = await UserModel.findById(id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.status !== "suspended") {
      return res.status(400).json({ message: "User is not suspended" });
    }

    user.status = "active";
    user.suspendedAt = undefined;
    user.suspendReason = undefined;
    await user.save();

    notify({
      recipientId: user._id,
      template: TEMPLATES.ACCOUNT_UNSUSPENDED(),
      data: { audience: "buyer" },
    });

    return res.status(200).json({ message: "User unsuspended", user });
  } catch (error) {
    console.error("Unsuspend user error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const banUser = async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  try {
    const user = await UserModel.findById(id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.status === "banned") {
      return res.status(400).json({ message: "User is already banned" });
    }

    user.status = "banned";
    user.bannedAt = new Date();
    user.banReason = reason;
    user.refreshToken = null;
    await user.save();

    return res.status(200).json({ message: "User banned", user });
  } catch (error) {
    console.error("Ban user error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const unbanUser = async (req, res) => {
  const { id } = req.params;

  try {
    const user = await UserModel.findById(id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.status !== "banned") {
      return res.status(400).json({ message: "User is not banned" });
    }

    user.status = "active";
    user.bannedAt = undefined;
    user.banReason = undefined;
    await user.save();

    return res.status(200).json({ message: "User unbanned", user });
  } catch (error) {
    console.error("Unban user error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Sends the same OTP-based reset email the user would trigger themselves via
// "forgot password" — the admin never sets or sees the new password.
const adminResetPassword = async (req, res) => {
  const { id } = req.params;

  try {
    const user = await UserModel.findById(id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await sendPasswordResetOtp(user);

    return res.status(200).json({ message: "Password reset instructions sent to the user's email" });
  } catch (error) {
    console.error("Admin reset password error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Soft delete — isDeleted/deletedAt already exist on the schema for this.
// Orders/Products/Reviews reference this user by id; a hard delete would
// orphan those historical records, so the account is deactivated, not erased.
const deleteUser = async (req, res) => {
  const { id } = req.params;

  try {
    const user = await UserModel.findById(id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isDeleted) {
      return res.status(400).json({ message: "User is already deleted" });
    }

    user.isDeleted = true;
    user.deletedAt = new Date();
    user.refreshToken = null;
    await user.save();

    return res.status(200).json({ message: "User deleted" });
  } catch (error) {
    console.error("Delete user error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  listUsers,
  getUserById,
  suspendUser,
  unsuspendUser,
  banUser,
  unbanUser,
  adminResetPassword,
  deleteUser,
};
