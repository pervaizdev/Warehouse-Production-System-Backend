/**
 * error.middleware.js — Global Error Handler
 * 
 * WHY a centralized error handler?
 * Without this, an unhandled error in any route crashes your entire server.
 * Express recognizes error-handling middleware by its 4 parameters: (err, req, res, next)
 * 
 * HOW IT WORKS:
 * If any route does `next(error)` or throws an error, Express skips all remaining
 * middleware and jumps straight to this handler.
 * 
 * SECURITY: In production, we hide the actual error message from the client.
 * Attackers can use error messages to learn about your system.
 */

const { sendError } = require("../utils/response.helper");
const logger = require("../utils/logger");

function errorHandler(err, req, res, next) {
  // Log the full error server-side (always)
  logger.error(err.message || "Unhandled Exception", err);

  const statusCode = err.status || err.statusCode || 500;
  const isDev = (process.env.NODE_ENV || "development") === "development";

  res.status(statusCode).json({
    success: false,
    message: isDev
      ? err.message                    // Show real error in dev
      : "Internal server error",       // Hide in production
    ...(isDev && { stack: err.stack }),
  });
}

module.exports = errorHandler;
