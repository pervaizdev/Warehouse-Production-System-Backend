const express = require('express');
const router = express.Router();
const productionOrdersController = require('../../controller/ProductionOrders/productionOrders.controller');
const authenticateToken = require('../../middleware/auth.middleware');
router.get('/products', authenticateToken, productionOrdersController.getProductionProducts);
router.get('/warehouses', authenticateToken, productionOrdersController.getWarehouses);
router.get('/sales-orders', authenticateToken, productionOrdersController.getOpenSalesOrders);
router.get('/open', authenticateToken, productionOrdersController.getOpenProductionOrders);
router.get('/customers', authenticateToken, productionOrdersController.getCustomers);
router.get('/bom/:itemCode', authenticateToken, productionOrdersController.getBOMDetails);
router.get('/:itemCode', authenticateToken, productionOrdersController.getProductionOrderDetails);

module.exports = router;
