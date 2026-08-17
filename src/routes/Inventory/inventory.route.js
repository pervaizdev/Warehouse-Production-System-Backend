const express = require('express');
const router = express.Router();
const inventoryController = require('../../controller/Inventory/inventory.controller');

// Executive KPI summary
router.get('/summary', inventoryController.getSummary);

// Paginated current stock table
router.get('/current', inventoryController.getCurrentStock);

// Warehouse-level summary
router.get('/warehouses', inventoryController.getWarehouseSummary);

// Item Group / Category breakdown
router.get('/item-groups', inventoryController.getItemGroupSummary);

// Inventory movement log (paginated)
router.get('/movements', inventoryController.getMovements);

// Batch expiry analysis (bucketed)
router.get('/expiry', inventoryController.getExpiry);

// Batch list (paginated)
router.get('/batches', inventoryController.getBatches);

// Purchase pipeline (open POs)
router.get('/purchase-pipeline', inventoryController.getPurchasePipeline);

// Sales commitments (open SOs)
router.get('/commitments', inventoryController.getCommitments);

// Production demand (open production orders)
router.get('/production-demand', inventoryController.getProductionDemand);

// Filter options (warehouses, item groups, categories)
router.get('/filters', inventoryController.getFilterOptions);

// Item detail drill-down
router.get('/items/:itemCode', inventoryController.getItemDetail);

module.exports = router;
