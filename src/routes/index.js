/**
 * routes/index.js — Centralized Route Loader
 * 
 * THIS IS THE KEY FILE THAT KEEPS app.js CLEAN!
 * 
 * COMPARE:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ Dome's app.js (40+ lines of route imports):                    │
 * │   const loginRoute = require("./routes/login/login.route");    │
 * │   const hrRoute = require("./routes/HR/hr.route");             │
 * │   const crmRoute = require("./routes/CRM/crm.route");         │
 * │   ... 37 more ...                                              │
 * │   app.use("/api", loginRoute);                                 │
 * │   app.use("/api/hr", authenticateToken, hrRoute);              │
 * │   ... 37 more ...                                              │
 * └─────────────────────────────────────────────────────────────────┘
 * 
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ WMS's app.js (1 line):                                         │
 * │   mountRoutes(app);                                            │
 * └─────────────────────────────────────────────────────────────────┘
 * 
 * HOW TO ADD A NEW MODULE:
 * 1. Create src/modules/inventory/inventory.routes.js
 * 2. Add ONE line below:  app.use("/api/inventory", auth, inventoryRoutes);
 * That's it. app.js never changes.
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
  // Always have a health endpoint — used by load balancers, monitoring tools
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
  // Add new modules here as you build them:
  // app.use("/api/inventory", authenticateToken, inventoryRoutes);
  // app.use("/api/receiving", authenticateToken, receivingRoutes);
  // app.use("/api/dispatch",  authenticateToken, dispatchRoutes);
  // app.use("/api/warehouse", authenticateToken, warehouseRoutes);
  // app.use("/api/reports",   authenticateToken, reportRoutes);
}

module.exports = { mountRoutes };
