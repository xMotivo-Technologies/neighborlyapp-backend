const express = require('express')
const { handleRegister } = require('../../controller/auth/registerController')
const { registerLimiter } = require('../../middleware/rateLimit')
const router = express.Router()

router.post("/auth/register", registerLimiter, handleRegister)


module.exports = router