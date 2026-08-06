/**
 * connection.js — Database Connection Manager
 * 
 * MULTI-POOL PATTERN:
 * Instead of Dome's single `poolPromise`, this creates a named pool for each database.
 * 
 * Usage in any controller/model:
 *   const { getPool, sql } = require("../../database/connection");
 *   const pool = await getPool("primary");       // Get the primary DB pool
 *   const result = await pool.request().query(`SELECT ...`);
 * 
 * WHY this is better than Dome's approach:
 * 1. Dome: const { poolPromise } = require("../../database/connection");
 *    → Only one database, to access another you write "GMS_Live.dbo.Table" in queries
 * 
 * 2. WMS:  const pool = await getPool("primary");
 *    → Clean queries, no cross-database references, easy to add new databases
 * 
 * LAZY CONNECTION:
 * Pools are created on first use, not at startup. If you define 5 databases but only
 * use 2, only 2 connections are opened. This saves resources.
 */

require("dotenv").config();
const driver = process.env.DB_DRIVER === 'msnodesqlv8' ? 'mssql/msnodesqlv8' : 'mssql';
const sql = require(driver);
if (process.env.DB_DRIVER === 'msnodesqlv8') {
  const mssqlPath = require.resolve('mssql');
  require.cache[mssqlPath] = {
    id: mssqlPath,
    filename: mssqlPath,
    loaded: true,
    exports: sql
  };
}
const { databases } = require("../config/db.config");

// Store active pools
const pools = {};

/**
 * Get a connection pool by name.
 * Creates the pool on first call, reuses it on subsequent calls.
 * 
 * @param {string} name - Database name from db.config.js (default: "primary")
 * @returns {Promise<sql.ConnectionPool>} Connected pool ready for queries
 */
async function getPool(name = "primary") {
  // Return existing pool if already connected
  if (pools[name] && pools[name].connected) {
    return pools[name];
  }

  const config = databases[name];
  if (!config) {
    throw new Error(`❌ Database "${name}" not found in config. Available: ${Object.keys(databases).join(", ")}`);
  }

  try {
    const pool = new sql.ConnectionPool(config);
    await pool.connect();
    pools[name] = pool;
    console.log(`✅ Connected to database: "${name}" (${config.database})`);
    return pool;
  } catch (err) {
    console.error(`❌ Failed to connect to database "${name}":`, err.message);
    throw err;
  }
}

/**
 * Close all database connections (useful for graceful shutdown)
 */
async function closeAll() {
  for (const [name, pool] of Object.entries(pools)) {
    try {
      await pool.close();
      console.log(`🔌 Closed database connection: "${name}"`);
      delete pools[name];
    } catch (err) {
      console.error(`Error closing pool "${name}":`, err.message);
    }
  }
}

module.exports = { sql, getPool, closeAll };
