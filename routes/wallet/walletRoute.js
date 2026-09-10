const express = require("express");
const { authToken, isRider } = require("../../middleware/auth");
const { getWallet, getWalletHistory, requestWithdrawal } = require("../../controller/wallet/walletController");

const router = express.Router();

router.get("/riders/wallet", authToken, isRider, getWallet);
router.get("/riders/wallet/history", authToken, isRider, getWalletHistory);
router.post("/riders/wallet/withdraw", authToken, isRider, requestWithdrawal);

module.exports = router;
