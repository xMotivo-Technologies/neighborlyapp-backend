const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const connectDB = require("./config/dbConfig");
const { globalLimiter } = require("./middleware/rateLimit");

require("dotenv").config();

const app = express();

// DB
connectDB();

// Middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
    ],
    credentials: true,
  }),
);

app.set('trust proxy', 1);
// verify callback stashes the raw body buffer for Paystack webhook signature checks
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(globalLimiter);

// Routes
app.use("/api", require("./routes/auth/loginRoute"));
app.use("/api", require("./routes/auth/registerRoute"));
app.use("/api", require("./routes/auth/resetPasswordRoute"));
app.use("/api", require("./routes/vendor/becomeAVendorRoute"));
app.use("/api", require("./routes/product/productRoute"));
app.use("/api", require("./routes/favorite/favoriteRoute"));
app.use("/api", require("./routes/advert/advertRoute"));
app.use("/api", require("./routes/order/orderRoute"));
app.use("/api", require("./routes/rider/riderRoute"));
app.use("/api", require("./routes/delivery/deliveryRoute"));
app.use("/api", require("./routes/wallet/walletRoute"));
app.use("/api", require("./routes/webhook/webhookRoute"));
app.use("/api", require("./routes/review/reviewRoute"));
app.use("/api", require("./routes/report/reportRoute"));
app.use("/api", require("./routes/user/profile/profileRoute"));
app.use("/api/admin", require("./routes/admin/authRoute"));
app.use("/api/admin", require("./routes/admin/vendorRoute"));
app.use("/api/admin", require("./routes/admin/riderRoute"));
app.use("/api/admin", require("./routes/admin/withdrawalRoute"));
app.use("/api/admin", require("./routes/admin/reviewRoute"));
app.use("/api/admin", require("./routes/admin/reportRoute"));
app.use("/api/admin", require("./routes/admin/dashboardRoute"));
app.use("/api/admin", require("./routes/admin/userRoute"));
app.use("/api/admin", require("./routes/admin/productRoute"));


// Test route
app.get("/", (req, res) => {
  res.json({
    message: "Server is working",
  });
});

// Run server
const port = process.env.PORT || 4000;

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
