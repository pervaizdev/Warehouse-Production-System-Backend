/**
 * app.js — Express Application Setup
 * 
 * This file does 3 things:
 * 1. Creates the Express app
 * 2. Applies middleware (security, parsing, logging)
 * 3. Mounts all routes via a single import (no 40+ require statements like Dome!)
 * 
 * PATTERN: Middleware order matters!
 * 1. Security headers (helmet) — first, so every response gets secure headers
 * 2. CORS — before any route handling
 * 3. Body parsing — so req.body is available in routes
 * 4. Logging — to see what's happening
 * 5. Routes — your actual API logic
 * 6. Error handler — LAST, catches anything that falls through
 */

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const hpp = require("hpp");
const morgan = require("morgan");

const corsConfig = require("./config/cors.config");
const { mountRoutes } = require("./routes");
const errorHandler = require("./middleware/error.middleware");

const app = express();

// ── Security Middleware ──────────────────────────────────
// helmet: Sets security HTTP headers (X-Content-Type-Options, X-Frame-Options, etc.)
// hpp: Protects against HTTP Parameter Pollution attacks
app.set("trust proxy", 1);
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false,
}));
app.use(hpp());

// ── CORS ─────────────────────────────────────────────────
app.use(cors(corsConfig));

// ── Body Parsing ─────────────────────────────────────────
// express.json(): Parses JSON request bodies (for POST/PUT with JSON)
// express.urlencoded(): Parses form-encoded data (like HTML forms)
// limit: Prevents someone from sending a 100MB payload to crash your server
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// ── Request Logging ──────────────────────────────────────
// morgan "dev" format: :method :url :status :response-time ms
// In production, switch to "combined" for full Apache-style logs
app.use(morgan("dev"));

// ── Routes ───────────────────────────────────────────────
// Single function mounts ALL module routes — this is the key difference from Dome
// No more 40+ require() statements here!
mountRoutes(app);

// ── Global Error Handler ─────────────────────────────────
// MUST be after all routes — Express identifies error handlers by having 4 params (err, req, res, next)
app.use(errorHandler);

module.exports = app;
