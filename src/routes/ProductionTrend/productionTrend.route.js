const express = require('express');
const router = express.Router();
const productionTrendController = require('../../controller/ProductionTrend/productionTrend.controller');
const authMiddleware = require('../../middleware/auth.middleware');

router.get('/summary', authMiddleware, productionTrendController.getSummary);
router.get('/monthly', authMiddleware, productionTrendController.getMonthlyTrend);
router.get('/yearly', authMiddleware, productionTrendController.getYearlyTrend);
router.get('/product-share', authMiddleware, productionTrendController.getProductShare);
router.get('/year-comparison', authMiddleware, productionTrendController.getYearComparison);
router.get('/table', authMiddleware, productionTrendController.getTableData);
router.get('/filters', authMiddleware, productionTrendController.getFilterOptions);

module.exports = router;
