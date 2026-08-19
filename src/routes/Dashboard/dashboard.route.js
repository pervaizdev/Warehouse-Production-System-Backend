const express = require('express');
const router = express.Router();
const dashboardController = require('../../controller/Dashboard/dashboard.controller');
const authenticateToken = require('../../middleware/auth.middleware');

router.get('/', authenticateToken, dashboardController.getOverviewData);

module.exports = router;
