const crypto = require("crypto");
const bcrypt = require("bcrypt");
const UserModel = require("../../../models/User");
const deleteAccountRequestMail = require("../../../utils/emails/deleteAccountRequestMail");
const accountDeletedMail = require("../../../utils/emails/accountDeletedMail");

const OTP_TTL_MS = 15 * 60 * 1000;

const generateOtp = () => {
  const code = Math.floor(1000 + Math.random() * 9000).toString();
  const hash = crypto.createHash("sha256").update(code).digest("hex");
  return { code, hash };
};

// Soft delete — mirrors admin/userController.js's deleteUser (isDeleted/
// deletedAt already exist on the schema for this; orders/products/reviews
// reference this user by id, so a hard delete would orphan those).
const softDeleteUser = async (userDoc) => {
  userDoc.isDeleted = true;
  userDoc.deletedAt = new Date();
  userDoc.refreshToken = null;
  await userDoc.save();
};

// Self-service delete for a logged-in app user. Requires the account
// password so a hijacked/left-open session can't irreversibly delete the
// account without re-proving who's asking.
const deleteAccount = async (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ message: "password is required" });
  }

  try {
    const userDoc = await UserModel.findById(req.user._id).select("+hashPass");

    if (!userDoc) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, userDoc.hashPass);
    if (!isMatch) {
      return res.status(401).json({ message: "Incorrect password" });
    }

    await softDeleteUser(userDoc);

    await accountDeletedMail({ email: userDoc.email }).catch((mailError) => {
      console.error("Account deleted mail error:", mailError);
    });

    return res.status(200).json({ message: "Account deleted" });
  } catch (error) {
    console.error("Delete account error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Step 1 of the web (no-login-required) deletion flow — required so app
// store reviewers can request deletion from a browser without installing
// the app. Only sends a confirmation code; the account isn't touched until
// confirmDeleteAccountWeb verifies it.
const requestDeleteAccountWeb = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "email is required" });
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    const userDoc = await UserModel.findOne({ email: normalizedEmail });

    if (!userDoc || userDoc.isDeleted) {
      return res.status(404).json({ message: "No account found for this email" });
    }

    const { code, hash } = generateOtp();
    userDoc.deleteAccountOtp = hash;
    userDoc.deleteAccountOtpExpires = new Date(Date.now() + OTP_TTL_MS);
    await userDoc.save();

    await deleteAccountRequestMail({ email: userDoc.email, otp: code });

    return res.status(200).json({ message: "Confirmation code sent to your email" });
  } catch (error) {
    console.error("Request delete account error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Step 2 of the web deletion flow — verifies the code from
// requestDeleteAccountWeb and actually performs the deletion.
const confirmDeleteAccountWeb = async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ message: "email and otp are required" });
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    const userDoc = await UserModel.findOne({ email: normalizedEmail }).select(
      "+deleteAccountOtp +deleteAccountOtpExpires",
    );

    if (!userDoc) {
      return res.status(404).json({ message: "No account found for this email" });
    }

    const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");

    if (!userDoc.deleteAccountOtp || userDoc.deleteAccountOtp !== hashedOtp || userDoc.deleteAccountOtpExpires < Date.now()) {
      return res.status(400).json({ message: "Invalid or expired code" });
    }

    userDoc.deleteAccountOtp = undefined;
    userDoc.deleteAccountOtpExpires = undefined;
    await softDeleteUser(userDoc);

    await accountDeletedMail({ email: userDoc.email }).catch((mailError) => {
      console.error("Account deleted mail error:", mailError);
    });

    return res.status(200).json({ message: "Account deleted" });
  } catch (error) {
    console.error("Confirm delete account error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  deleteAccount,
  requestDeleteAccountWeb,
  confirmDeleteAccountWeb,
};
