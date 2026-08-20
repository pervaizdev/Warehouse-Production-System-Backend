require('dotenv').config();
const { sql, poolPromise } = require('./src/database/connection');

async function test() {
  try {
    const pool = await poolPromise;
    const res = await pool.request().query(`
      SELECT SUM(i.Quantity) AS TotalQty 
      FROM LDS_LIVE.dbo.IGN1 i 
      INNER JOIN LDS_LIVE.dbo.OIGN h ON i.DocEntry = h.DocEntry 
      INNER JOIN LDS_LIVE.dbo.OWOR p ON i.BaseEntry = p.DocEntry 
      WHERE i.BaseType = 202 AND h.CANCELED = 'N'
    `);
    console.log("Total Production Qty:");
    console.dir(res.recordset, {depth: null});
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
test();
