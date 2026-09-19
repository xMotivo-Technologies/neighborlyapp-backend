const jwt = require("jsonwebtoken");
const AdminModel = require("../models/admin");
const userModel = require("../models/User");
const RiderModel = require("../models/Rider");
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

    // Enforced here, not just at login — an admin suspending/banning/deleting
    // a user must take effect on their very next request, not just block
    // future logins while an already-issued token keeps working.
    if (user.isDeleted) return res.status(401).json({ message: "Account has been deleted" });
    if (user.status === "suspended") return res.status(403).json({ message: "Account suspended" });
    if (user.status === "banned") return res.status(403).json({ message: "Account banned" });

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

// Like authToken, but never rejects — sets req.user when a valid token is
// present, otherwise just calls next() so public routes stay public. A
// deleted/suspended/banned user is treated as anonymous rather than erroring.
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await userModel.findById(decoded.id);
    if (user && !user.isDeleted && user.status === "active") req.user = user;
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

// Requires authToken to have run first (needs req.user). Checked against the
// Rider collection (not req.user.role) so a rider application doesn't clash
// with an existing vendor role on the same account. Attaches req.rider.
const isRider = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "No token provided" });
  }

  try {
    const rider = await RiderModel.findOne({ user: req.user._id, status: "approved" });

    if (!rider) {
      return res.status(403).json({ message: "Approved rider access required" });
    }

    req.rider = rider;
    next();
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
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

module.exports = {verifyAdmin, authToken, optionalAuth, isVendor, isRider};