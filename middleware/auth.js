const jwt = require("jsonwebtoken");
const AdminModel = require("../models/admin");
const userModel = require("../models/User");
require('dotenv').config();

const verifyAdmin = async (req, res, next) => {
  const token = req.cookies.adminToken; // read from cookie

  if (!token) return res.status(401).json({ message: "No token provided" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const admin = await AdminModel.findById(decoded.id);
    if (!admin) return res.status(401).json({ message: "Admin not found" });

    req.admin = admin;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}; 

// for mobile
const authToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await userModel.findById(decoded.id);
    if (!user) return res.status(401).json({ message: "User not found" });

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

// Like authToken, but never rejects — sets req.user when a valid token is
// present, otherwise just calls next() so public routes stay public.
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await userModel.findById(decoded.id);
    if (user) req.user = user;
  } catch (err) {
    // invalid/expired token -> treat as anonymous
  }

  next();
};

// Requires authToken to have run first (needs req.user)
const isVendor = (req, res, next) => {
  if (!req.user || req.user.role !== "vendor") {
    return res.status(403).json({ message: "Vendor access required" });
  }
  next();
};

// const authToken = async (req, res, next) => {
//   const token = req.cookies.token;  

//   if (!token) return res.status(401).json({ message: "No token provided" });


//     try {
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);

//     const user = await userModel.findById(decoded.id);
//     if (!user) return res.status(401).json({ message: "User not found" });

//     req.user = user;
//     next();
//   } catch (err) {
//     return res.status(401).json({ message: "Invalid or expired token" });
//   }
// }

module.exports = {verifyAdmin, authToken, optionalAuth, isVendor};