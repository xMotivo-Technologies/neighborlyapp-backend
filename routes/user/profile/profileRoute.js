const express = require('express')
const { authToken } = require('../../../middleware/auth')
const { getUserProfile, updateProfile } = require('../../../controllers/user/profile/profileController')
const router = express.Router()

router.get('/profile', authToken, getUserProfile )   
router.patch('/profile', authToken, updateProfile )   
 
module.exports = router  