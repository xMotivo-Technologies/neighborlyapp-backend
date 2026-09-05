const AdminModel = require("../../models/admin");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const handleAdminRegister = async (req, res) => {
  const { email, password, firstName, lastName, registrationSecret } = req.body;

  if (!email || !password || !firstName || !lastName) {
    return res.status(400).json({ message: "All fields are required" });
  }

  if (registrationSecret !== process.env.ADMIN_REGISTRATION_SECRET) {
    return res.status(403).json({ message: "Invalid registration secret" });
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    const existingAdmin = await AdminModel.findOne({ email: normalizedEmail });

    if (existingAdmin) {
      return res.status(400).json({ message: "Admin already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newAdmin = await AdminModel.create({
      email: normalizedEmail,
      hashPass: hashedPassword,
      firstName,
      lastName,
    });

    return res.status(201).json({
      message: "Admin created successfully",
      admin: {
        id: newAdmin._id,
        email: newAdmin.email,
        firstName: newAdmin.firstName,
      },
    });
  } catch (error) {
    console.error("Admin register error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

const handleAdminLogin = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    const adminDoc = await AdminModel.findOne({ email: normalizedEmail }).select("+hashPass");

    if (!adminDoc) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, adminDoc.hashPass);

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const adminToken = jwt.sign({ id: adminDoc._id }, process.env.JWT_SECRET, {
      expiresIn: "12h",
    });

    res.cookie("adminToken", adminToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 12 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      message: "Login successful",
      admin: {
        id: adminDoc._id,
        email: adminDoc.email,
        firstName: adminDoc.firstName,
      },
    });
  } catch (error) {
    console.error("Admin login error:", error);
    return res.status(500).json({ message: "Login failed" });
  }
};

const handleAdminLogout = async (req, res) => {
  res.clearCookie("adminToken");
  return res.status(200).json({ message: "Logged out successfully" });
};

module.exports = {
  handleAdminRegister,
  handleAdminLogin,
  handleAdminLogout,
};
