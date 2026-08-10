const express = require('express');
const router = express.Router();
const efficiencyController = require('../../controller/MachineEfficiency/efficiency.controller');
const authMiddleware = require('../../middleware/auth.middleware');

router.get('/machine-efficiency', authMiddleware, efficiencyController.getMachineEfficiency);
router.get('/filter-options', authMiddleware, efficiencyController.getFilterOptions);
router.get('/machine/:machineId', authMiddleware, efficiencyController.getMachineDrilldown);
router.get('/order/:orderNum', authMiddleware, efficiencyController.getOrderDrilldown);

module.exports = router;
