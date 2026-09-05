const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const jwt = require("jsonwebtoken");

const minutes = (n) => n * 60 * 1000;

const loginLimiter = rateLimit({
  windowMs: minutes(15),
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts, please try again later" },
});

const refreshLimiter = rateLimit({
  windowMs: minutes(15),
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many refresh attempts, please try again later" },
});

const registerLimiter = rateLimit({
  windowMs: minutes(60),
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many registration attempts, please try again later" },
});

const passwordResetRequestLimiter = rateLimit({
  windowMs: minutes(60),
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many password reset requests, please try again later" },
});

// Keys by the authenticated user's id when a valid access token is present,
// otherwise falls back to IP so anonymous requests are still bounded.
const getUserOrIpKey = (req) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      const decoded = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
      return `user:${decoded.id}`;
    } catch (err) {
      // invalid/expired token -> fall back to IP
    }
  }

  return ipKeyGenerator(req.ip);
};

const globalLimiter = rateLimit({
  windowMs: minutes(15),
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getUserOrIpKey,
  message: { message: "Too many requests, please try again later" },
});

module.exports = {
  loginLimiter,
  refreshLimiter,
  registerLimiter,
  passwordResetRequestLimiter,
  globalLimiter,
};
