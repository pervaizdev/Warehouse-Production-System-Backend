const express = require('express');
const router = express.Router();
const authController = require('../../controller/Auth/auth.controller');
const authenticateToken = require('../../middleware/auth.middleware');

router.post('/login', authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', authenticateToken, authController.getMe);

module.exports = router;
