/**
 * logger.js — Logging Utility
 * 
 * Simple structured logger. Wraps console methods with timestamps and context.
 * Can be replaced with Winston/Pino later if you need file logging, log rotation, etc.
 */

const logger = {
  info: (message, data = {}) => {
    console.log(`[${new Date().toISOString()}] ℹ️  ${message}`, Object.keys(data).length ? data : "");
  },

  warn: (message, data = {}) => {
    console.warn(`[${new Date().toISOString()}] ⚠️  ${message}`, Object.keys(data).length ? data : "");
  },

  error: (message, error = null) => {
    console.error(`[${new Date().toISOString()}] ❌ ${message}`, error?.message || "");
    if (error?.stack && process.env.NODE_ENV === "development") {
      console.error(error.stack);
    }
  },

  debug: (message, data = {}) => {
    if (process.env.NODE_ENV === "development") {
      console.log(`[${new Date().toISOString()}] 🔍 ${message}`, Object.keys(data).length ? data : "");
    }
  },
};

module.exports = logger;
