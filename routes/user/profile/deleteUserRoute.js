const express = require('express')
const { authToken } = require('../../../middleware/auth')
const { deleteAccountRequestLimiter } = require('../../../middleware/rateLimit')
const {deleteAccount, requestDeleteAccountWeb, confirmDeleteAccountWeb} = require('../../../controller/user/profile/deleteUserController')
const router = express.Router()

router.delete('/account/delete', authToken, deleteAccount)
router.post('/account/delete-request', deleteAccountRequestLimiter, requestDeleteAccountWeb)
router.post('/account/delete-confirm', confirmDeleteAccountWeb)
module.exports = router
