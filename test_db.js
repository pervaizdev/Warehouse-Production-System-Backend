const sql = require('mssql/msnodesqlv8');
require('dotenv').config();

const config = {
  connectionString: `Driver={ODBC Driver 17 for SQL Server};Server=${process.env.Database_Server};Database=LDS_LIVE;Trusted_Connection=yes;TrustServerCertificate=yes;`,
  options: {
    trustServerCertificate: true,
    useUTC: true,
    requestTimeout: 60000,
  },
};

async function runQueries() {
  try {
    console.log("Connecting to LDS_LIVE...");
    await sql.connect(config);
    console.log("Connected!");

    console.log("\n--- How OWOR connects to WOR1 ---");
    const oworWor1 = await sql.query(`SELECT TOP 2 OWOR.DocNum, WOR1.LineNum, WOR1.ItemCode, WOR1.ItemType FROM LDS_LIVE.dbo.OWOR INNER JOIN LDS_LIVE.dbo.WOR1 ON OWOR.DocEntry = WOR1.DocEntry WHERE WOR1.ItemType = 290;`);
    console.table(oworWor1.recordset);

    console.log("\n--- Resource Consumption in WOR1 ---");
    const consumption = await sql.query(`SELECT TOP 2 ItemCode, BaseQty, PlannedQty, IssuedQty FROM LDS_LIVE.dbo.WOR1 WHERE ItemType = 290 AND IssuedQty > 0;`);
    console.table(consumption.recordset);

    console.log("\n--- ORCJ Capacity check ---");
    const capacity = await sql.query(`SELECT TOP 2 ResCode, Capacity, CapType FROM LDS_LIVE.dbo.ORCJ WHERE Capacity > 0;`);
    console.table(capacity.recordset);

    console.log("\n--- Receipt Mapping (IGN1) ---");
    console.log("\n--- ORCJ Capacity with Dates ---");
    const orcj = await sql.query(`SELECT TOP 10 ResCode, CapDate, Capacity FROM LDS_LIVE.dbo.ORCJ WHERE Capacity > 0`);
    console.table(orcj.recordset);

  } catch (err) {
    console.error("SQL Error:", err);
  } finally {
    process.exit(0);
  }
}

runQueries();
