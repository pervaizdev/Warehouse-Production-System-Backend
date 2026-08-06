/**
 * app.config.js — Application-level Constants
 * 
 * WHY a config file instead of process.env everywhere?
 * - Single source of truth: if an env variable name changes, update ONE file
 * - Default values: no crashes if .env is missing a variable
 * - Type safety: parseInt/parseBool happen here, not scattered across controllers
 * - Documentation: you can see ALL config values at a glance
 */

module.exports = {
  PORT: parseInt(process.env.PORT) || 3001,
  NODE_ENV: process.env.NODE_ENV || "development",

  // JWT
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "15m",
  REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET,
  REFRESH_TOKEN_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN || "7d",

  // Request limits
  MAX_PAGE_SIZE: 100,       // Max items per page (prevents someone requesting 10,000 rows)
  DEFAULT_PAGE_SIZE: 20,    // Default if client doesn't specify
};
