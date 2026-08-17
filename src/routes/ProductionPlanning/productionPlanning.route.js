const express = require("express");
const router = express.Router();
const { 
  getExecutiveKPIs, 
  getMaterialShortages, 
  getBatchExpiry 
} = require("../../controller/ProductionPlanning/productionPlanning.controller");

router.get("/kpis", getExecutiveKPIs);
router.get("/shortages", getMaterialShortages);
router.get("/batch-expiry", getBatchExpiry);

module.exports = router;
