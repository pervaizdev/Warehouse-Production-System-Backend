/**
 * db.config.js — Database Configuration
 * 
 * MULTI-DATABASE SUPPORT:
 * Your enterprise uses SAP B1 with potentially multiple databases (HCM_GMS, GMS_Live, WMS_DB, etc.)
 * This config defines connection settings for each database you might need.
 * 
 * HOW IT WORKS:
 * - Each key in `databases` is a "database name" you'll reference in your code
 * - The connection.js file creates a pool for each one
 * - In your controllers, you do: const pool = await getPool("sap"); or getPool("hcm");
 * 
 * WHY not just one pool like Dome?
 * Dome uses a single poolPromise tied to HCM_Database. When you need GMS_Live data,
 * you write "GMS_Live.dbo.TableName" in every query — fragile and repetitive.
 * With named pools, you just pick the right pool and write clean queries.
 */

// Base connection options shared by all databases
const baseOptions = {
  encrypt: true,
  trustServerCertificate: true,
  useUTC: true,
  requestTimeout: 60000,
};

const basePool = {
  max: 50,
  min: 2,
  idleTimeoutMillis: 30000,
};

/**
 * Define your databases here.
 * Add new ones as you discover what you need.
 * 
 * Each entry creates a separate connection pool.
 * Use the key name to reference it: getPool("primary")
 */
const databases = {
  // Primary database — your main WMS/SAP database
  primary: process.env.DB_DRIVER === 'msnodesqlv8'
    ? {
        connectionString: `Driver={ODBC Driver 17 for SQL Server};Server=${process.env.DB_SERVER};Database=${process.env.DB_NAME};Trusted_Connection=yes;TrustServerCertificate=yes;`,
        options: { ...baseOptions },
      }
    : {
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        server: process.env.DB_SERVER,
        port: parseInt(process.env.DB_PORT) || 1433,
        database: process.env.DB_NAME,
        options: { ...baseOptions },
        pool: { ...basePool },
      },

  // Add more databases as needed:
  // hcm: {
  //   user: process.env.DB_USER,
  //   password: process.env.DB_PASSWORD,
  //   server: process.env.DB_SERVER,
  //   port: parseInt(process.env.DB_PORT) || 1433,
  //   database: process.env.HCM_DB_NAME,
  //   options: { ...baseOptions },
  //   pool: { ...basePool },
  // },
};

module.exports = { databases };
