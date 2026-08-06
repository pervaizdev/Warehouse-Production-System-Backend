/**
 * server.js — Entry Point
 * 
 * WHY separate from app.js?
 * - app.js creates and configures the Express app (middleware, routes, error handling)
 * - server.js starts listening on a port
 * - This separation lets you import `app` in tests without actually starting the server
 * - It also keeps startup tasks (schedulers, cron jobs) isolated here
 */

const dotenv = require("dotenv");
dotenv.config(); // Load .env BEFORE anything else uses process.env

const app = require("./app");
const { PORT } = require("./config/app.config");

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 WMS Server running on: http://localhost:${PORT}`);
  console.log(`📦 Environment: ${process.env.NODE_ENV || "development"}`);

  // ── Startup Tasks ──────────────────────────────────────
  // Add schedulers/cron jobs here as the project grows
  // Example: const startInventorySync = require("./schedulers/inventorySync");
  //          startInventorySync();
  
  // FIX: mssql/msnodesqlv8 native driver on Node 24 can cause the event loop to exit
  // prematurely when only an HTTP server handle is active. This dummy interval
  // ensures the event loop stays alive. (Dome stays alive because of its cron schedulers).
  setInterval(() => {}, 1000 * 60 * 60);
});
