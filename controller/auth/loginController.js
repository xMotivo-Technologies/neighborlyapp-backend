const UserModel = require("../../models/User");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const handleLogin = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    const userDoc = await UserModel
      .findOne({ email: normalizedEmail })
      .select("+hashPass +refreshToken");

    if (!userDoc) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    if (userDoc.isDeleted) {
      return res.status(403).json({ message: "Account has been deleted" });
    }

    if (userDoc.status === "suspended") {
      return res.status(403).json({ message: "Account suspended" });
    }

    if (userDoc.status === "banned") {
      return res.status(403).json({ message: "Account banned" });
    }

    const isMatch = await bcrypt.compare(password, userDoc.hashPass);

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const accessToken = jwt.sign({ id: userDoc._id }, process.env.JWT_SECRET, {
      expiresIn: "15m",
    });

    const refreshToken = jwt.sign(
      { id: userDoc._id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: "30d" },
    );

    const { hashPass, ...user } = userDoc.toObject();

    userDoc.refreshToken = refreshToken;
    await userDoc.save();

    res.status(200).json({
      message: "Login successful",
      accessToken,
      refreshToken,
      user,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Login Failed" });
  }
};

const DeviceTokenModel = require("../../models/DeviceToken");

const handleLogout = async (req, res) => {
  const { refreshToken, pushToken, token } = req.body;
  const expoToken = pushToken || token;

  try {
    if (!refreshToken) {
      return res.status(400).json({ message: "Refresh Token is required" });
    }

    const userDoc = await UserModel
      .findOne({ refreshToken })
      .select("+refreshToken");

    if (!userDoc) {
      if (expoToken) {
        await DeviceTokenModel.deleteOne({ token: expoToken });
      }
      return res.status(200).json({ message: "Logged out successfully" });
    }

    userDoc.refreshToken = null;
    if (expoToken) {
      userDoc.expoTokens = (userDoc.expoTokens || []).filter((t) => t !== expoToken);
      await DeviceTokenModel.deleteOne({ token: expoToken, user: userDoc._id });
    }
    await userDoc.save();

    return res.status(200).json({ message: "Logged out successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error occured while logging out" });
  }
};

module.exports = {
  handleLogin,
  handleLogout,
};