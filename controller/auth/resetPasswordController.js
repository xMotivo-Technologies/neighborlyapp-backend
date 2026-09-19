const crypto = require("crypto");
const UserModel = require("../../models/User");
const resetPasswordMail = require("../../utils/emails/resetPasswordMail");
const resetPasswordSuccessMail = require("../../utils/emails/resetPasswordSuccessMail");
const bcrypt = require("bcrypt");

// Shared by self-service forgotPassword and the admin-triggered reset
// (controller/admin/userController.js) — same OTP + email flow either way,
// so an admin never sets or even sees the user's new password directly.
const sendPasswordResetOtp = async (userDoc) => {
  const resetCode = Math.floor(1000 + Math.random() * 9000).toString();

  const hashedCode = crypto
    .createHash("sha256")
    .update(resetCode)
    .digest("hex");

  userDoc.otp = hashedCode;
  userDoc.resetCodeExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  await userDoc.save();
  await resetPasswordMail({ email: userDoc.email, otp: resetCode });
};

const forgotPassword = async (req, res) => {
  const { email } = req.body;
  try {
    const userDoc = await UserModel.findOne({ email });

    if (!userDoc) {
      return res.status(404).json({ message: "User not found" });
    }

    await sendPasswordResetOtp(userDoc);

    res
      .status(200)
      .json({ message: "Password reset instructions sent to your email" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
};

const verifyOtp = async (req, res) => {
  const { otp, email } = req.body;
  try {
    if (!otp) {
      return res.status(400).json({ message: "OTP is required" });
    }

    const userDoc = await UserModel
      .findOne({ email })
      .select("+otp +resetCodeExpires");

    if (!userDoc) {
      return res.status(404).json({ message: "User not found" });
    }

    const hashedCode = crypto.createHash("sha256").update(otp).digest("hex");

    if (userDoc.otp !== hashedCode || userDoc.resetCodeExpires < Date.now()) {
      return res.status(400).json({ message: "Invalid or expired code" });
    }

    res.status(200).json({ message: "OTP verified successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error verifying OTP" });
  }
};

const resetPassword = async (req, res) => {
  const { otp, password, email } = req.body;

  try {
    if (!otp || !password) {
      return res.status(400).json({
        message: "OTP and Password are required",
      });
    }

    if (!otp || !password || password.length < 6) {
      return res
        .status(400)
        .json({ message: "OTP and password (min 6 chars) are required" });
    }

    const userDoc = await UserModel
      .findOne({email})
      .select("+otp +resetCodeExpires +hashPass");

    if (!userDoc) {
      return res.status(404).json({ message: "User not found" });
    }

    const hashedCode = crypto.createHash("sha256").update(otp).digest("hex");

    if (userDoc.otp !== hashedCode || userDoc.resetCodeExpires < Date.now()) {
      return res.status(400).json({
        message: "Invalid or expired code",
      });
    }

    userDoc.hashPass = await bcrypt.hash(password, 10);

    userDoc.otp = undefined;
    userDoc.resetCodeExpires = undefined;

    await userDoc.save();

    await resetPasswordSuccessMail({
      email: userDoc.email,
    });

    return res.status(200).json({
      message: "Password reset successfully",
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      message: "Error resetting Password",
    });
  }
};

module.exports = {
  forgotPassword,
  verifyOtp,
  resetPassword,
  sendPasswordResetOtp,
};