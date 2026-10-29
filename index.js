const express = require("express");
const http = require("http");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const connectDB = require("./config/dbConfig");
const { globalLimiter } = require("./middleware/rateLimit");
const { initSocket } = require("./utils/socket");

require("dotenv").config();

const app = express();

const corsOrigins = ["http://localhost:5173", "http://localhost:5174"];

// DB
connectDB();

// Middleware
app.use(
  cors({
    origin: corsOrigins,
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
app.use("/api", require("./routes/vendor/vendorAnalyticsRoute"));
app.use("/api", require("./routes/product/productRoute"));
app.use("/api", require("./routes/favorite/favoriteRoute"));
app.use("/api", require("./routes/advert/advertRoute"));
app.use("/api", require("./routes/order/orderRoute"));
app.use("/api", require("./routes/rider/riderRoute"));
app.use("/api", require("./routes/delivery/deliveryRoute"));
app.use("/api", require("./routes/wallet/walletRoute"));
app.use("/api", require("./routes/wallet/vendorWalletRoute"));
app.use("/api", require("./routes/webhook/webhookRoute"));
app.use("/api", require("./routes/review/reviewRoute"));
app.use("/api", require("./routes/report/reportRoute"));
app.use("/api", require("./routes/user/profile/profileRoute"));
app.use("/api", require("./routes/user/profile/deleteUserRoute"));
app.use("/api", require("./routes/device/deviceRoute"));
app.use("/api", require("./routes/notification/notificationRoute"));
app.use("/api", require("./routes/chat/chatRoute"));
app.use("/api/admin", require("./routes/admin/authRoute"));
app.use("/api/admin", require("./routes/admin/vendorRoute"));
app.use("/api/admin", require("./routes/admin/riderRoute"));
app.use("/api/admin", require("./routes/admin/withdrawalRoute"));
app.use("/api/admin", require("./routes/admin/vendorWithdrawalRoute"));
app.use("/api/admin", require("./routes/admin/settingsRoute"));
app.use("/api/admin", require("./routes/admin/advertPlanRoute"));
app.use("/api/admin", require("./routes/admin/reviewRoute"));
app.use("/api/admin", require("./routes/admin/reportRoute"));
app.use("/api/admin", require("./routes/admin/dashboardRoute"));
app.use("/api/admin", require("./routes/admin/userRoute"));
app.use("/api/admin", require("./routes/admin/productRoute"));
app.use("/api/admin", require("./routes/admin/notificationRoute"));


// Test route
app.get("/", (req, res) => {
  res.json({
    message: "Server is working",
  });
});

// Run server. A plain http.Server wraps the express app so Socket.io can
// share the same port instead of needing a second listener/process.
const port = process.env.PORT || 4000;
const server = http.createServer(app);

initSocket(server, { origin: corsOrigins, credentials: true });

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// Push notification receipts reconciliation cron (runs every 30 mins)
if (process.env.NOTIFICATION_CRON !== "false") {
  const cron = require("node-cron");
  const { checkReceipts } = require("./services/notificationService");

  cron.schedule("*/30 * * * *", async () => {
    try {
      await checkReceipts();
    } catch (cronError) {
      console.error("Receipt check cron job error:", cronError);
    }
  });
}

// Delivery settlement sweep (runs once a day): auto-confirms deliveries a
// buyer never confirmed, and retries any rider/vendor wallet credit that
// previously failed. See autoConfirmStaleDeliveries/retryFailedDeliveryPayouts
// in controller/delivery/deliveryController.js.
if (process.env.DELIVERY_SETTLEMENT_CRON !== "false") {
  const cron = require("node-cron");
  const { autoConfirmStaleDeliveries, retryFailedDeliveryPayouts } = require("./controller/delivery/deliveryController");

  cron.schedule("0 3 * * *", async () => {
    try {
      const autoConfirmed = await autoConfirmStaleDeliveries();
      const { riderRetries, vendorRetries } = await retryFailedDeliveryPayouts();
      console.log(
        `Delivery settlement sweep: auto-confirmed ${autoConfirmed}, retried ${riderRetries} rider payout(s), ${vendorRetries} vendor payout(s)`,
      );
    } catch (cronError) {
      console.error("Delivery settlement cron job error:", cronError);
    }
  });
}

