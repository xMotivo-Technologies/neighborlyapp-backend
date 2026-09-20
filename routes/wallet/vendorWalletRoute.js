const express = require("express");
const { authToken, isVendor } = require("../../middleware/auth");
const {
  getWallet,
  getWalletHistory,
  updateVendorBankDetails,
  requestWithdrawal,
} = require("../../controller/wallet/vendorWalletController");

const router = express.Router();

router.get("/vendor/wallet", authToken, isVendor, getWallet);
router.get("/vendor/wallet/history", authToken, isVendor, getWalletHistory);
router.put("/vendor/wallet/bank-details", authToken, isVendor, updateVendorBankDetails);
router.post("/vendor/wallet/withdraw", authToken, isVendor, requestWithdrawal);

module.exports = router;
