const { poolPromise } = require('./database/connection');

const queries = [
  // 1. Profile Delivery Notes (ODLN, DLN1)
  `SELECT TOP 5 DocNum, DocDate, DocDueDate, CardCode, CardName FROM LDS_Live.dbo.ODLN (NOLOCK) ORDER BY DocNum DESC;`,
  `SELECT TOP 5 DocEntry, ItemCode, Dscription, Quantity, WhsCode FROM LDS_Live.dbo.DLN1 (NOLOCK) ORDER BY DocEntry DESC;`,

  // 2. Profile Sales Orders (ORDR, RDR1)
  `SELECT TOP 5 DocNum, DocDate, DocDueDate, CardCode, CardName, DocStatus FROM LDS_Live.dbo.ORDR (NOLOCK) ORDER BY DocNum DESC;`,
  `SELECT TOP 5 DocEntry, ItemCode, Dscription, Quantity, OpenQty, WhsCode FROM LDS_Live.dbo.RDR1 (NOLOCK) WHERE OpenQty > 0 ORDER BY DocEntry DESC;`,

  // 3. Profile Receipt from Production (OIGN, IGN1)
  `SELECT TOP 5 DocNum, DocDate, Ref2 FROM LDS_Live.dbo.OIGN (NOLOCK) ORDER BY DocNum DESC;`,
  `SELECT TOP 5 DocEntry, ItemCode, Dscription, Quantity, BaseType, BaseEntry, BaseRef FROM LDS_Live.dbo.IGN1 (NOLOCK) ORDER BY DocEntry DESC;`
];

async function runQueries() {
  try {
    const pool = await poolPromise;
    for (const q of queries) {
      console.log(`\nExecuting: ${q}`);
      try {
        const result = await pool.request().query(q);
        console.log("Result:", JSON.stringify(result.recordset, null, 2));
      } catch (err) {
        console.error("Error executing query:", err.message);
      }
    }
  } catch (err) {
    console.error("Connection Error:", err.message);
  } finally {
    process.exit(0);
  }
}

runQueries();
