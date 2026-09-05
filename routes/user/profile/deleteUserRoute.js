const express = require('express')
const { authToken } = require('../../../middleware/auth')
const {deleteAccount, requestDeleteAccountWeb} = require('../../../controllers/user/profile/deleteUserController')
const router = express.Router()
    
router.delete('/account/delete', authToken, deleteAccount)   
router.post('/account/delete-request', requestDeleteAccountWeb)   
module.exports = router  