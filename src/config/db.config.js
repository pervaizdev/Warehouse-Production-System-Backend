require("dotenv").config();

// const config = {
//   user: process.env.DB_USER,
//   password: process.env.DB_PASSWORD,
//   server: process.env.DB_SERVER,
//   database: process.env.DB_NAME,
//   options: {
//     encrypt: true,
//     trustServerCertificate: true,
//     useUTC: true,
//     requestTimeout: 120000,
//   },
//   pool: {
//     max: 100,
//     min: 2,
//     idleTimeoutMillis: 30000,
//   },
// };
// module.exports = config;

const config = process.env.DB_DRIVER === 'msnodesqlv8'
  ? {
    connectionString: `Driver={ODBC Driver 17 for SQL Server};Server=${process.env.DB_SERVER};Database=${process.env.DB_NAME};Trusted_Connection=yes;TrustServerCertificate=yes;`,
    options: {
      trustServerCertificate: true,
      useUTC: true,
      requestTimeout: 60000,
    },
  }
  : {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    port: parseInt(process.env.DB_PORT) || 1433,
    database: process.env.DB_NAME,
    options: {
      encrypt: true,
      trustServerCertificate: true,
      useUTC: true,
      requestTimeout: 60000,
    },
  };

module.exports = config;
