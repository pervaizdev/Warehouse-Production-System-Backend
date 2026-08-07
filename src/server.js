/**
 * server.js — Entry Point
 * - server.js starts listening on a port
 * - This separation lets you import `app` in tests without actually starting the server
 * - It also keeps startup tasks (schedulers, cron jobs) isolated here
 */

const dotenv = require("dotenv");
dotenv.config(); // Load .env BEFORE anything else uses process.env

const app = require("./app");

const PORT = process.env.PORT || 3001;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 WMS Server running on: http://localhost:${PORT}`);
  console.log(`📦 Environment: ${process.env.NODE_ENV || "development"}`);

  // ── Startup Tasks ──────────────────────────────────────
  // schedulers/cron jobs can be added here
 
  // FIX: mssql/msnodesqlv8 native driver on Node 24 can cause the event loop to exit
  // prematurely when only an HTTP server handle is active. This dummy interval
  // ensures the event loop stays alive.
  setInterval(() => {}, 1000 * 60 * 60);
});
