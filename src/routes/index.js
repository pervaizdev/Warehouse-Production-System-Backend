/**
 * routes/index.js — Centralized Route Loader
 * HOW TO ADD A NEW MODULE:
 * 1. Create src/modules/inventory/inventory.routes.js
 * 2. Add ONE line below:  app.use("/api/inventory", auth, inventoryRoutes);
 */

const authenticateToken = require("../middleware/auth.middleware");

// Module routes
const authRoutes = require("../modules/auth/auth.routes");

/**
 * Mount all routes on the Express app
 * @param {import("express").Express} app
 */
function mountRoutes(app) {
  // ── Health Check ─────────────────────────────────────────
  app.get("/api/health", (req, res) => {
    res.json({ 
      success: true, 
      message: "WMS API is running",
      timestamp: new Date().toISOString(),
    });
  });

  // ── Public Routes (no auth) ──────────────────────────────
  app.use("/api/auth", authRoutes);

  // ── Protected Routes (require JWT) ───────────────────────
  // Add new modules here:
  // app.use("/api/inventory", authenticateToken, inventoryRoutes);
  // app.use("/api/receiving", authenticateToken, receivingRoutes);
  // app.use("/api/dispatch",  authenticateToken, dispatchRoutes);
  // app.use("/api/warehouse", authenticateToken, warehouseRoutes);
  // app.use("/api/reports",   authenticateToken, reportRoutes);
}

module.exports = { mountRoutes };
