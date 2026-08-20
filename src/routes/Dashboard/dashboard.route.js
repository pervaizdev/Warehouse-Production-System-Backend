const express = require('express');
const router = express.Router();
const dashboardController = require('../../controller/Dashboard/dashboard.controller');
const authenticateToken = require('../../middleware/auth.middleware');

router.get('/', authenticateToken, dashboardController.getOverviewData);
router.get('/filtered-orders', authenticateToken, dashboardController.getFilteredOrders);

module.exports = router;
