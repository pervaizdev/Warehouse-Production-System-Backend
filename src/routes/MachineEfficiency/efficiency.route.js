const express = require('express');
const router = express.Router();
const efficiencyController = require('../../controller/MachineEfficiency/efficiency.controller');
const authMiddleware = require('../../middleware/auth.middleware');
router.get('/machine-efficiency', authMiddleware, efficiencyController.getMachineEfficiency);

module.exports = router;
