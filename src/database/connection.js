require("dotenv").config();
const config = require("../config/db.config");

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

const poolPromise = sql.connect(config)
  .then((pool) => {
    const isLive = (process.env.DB_SERVER || '').includes('115.186.130.76');
    const envType = isLive ? 'live' : 'local';
    console.log(`✅ Connected to SQL Server (${envType})`);
    return pool;
  })
  .catch((err) => {
    console.error("❌ Database Connection Failed:", err.message);
    throw new Error("Database Connection Failed");
  });

module.exports = { sql, poolPromise };
