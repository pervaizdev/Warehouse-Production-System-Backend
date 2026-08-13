const sql = require('mssql');
const fs = require('fs');

const config = {
  user: 'sa',
  password: 'AdmTsg@2020',
  server: '115.186.130.76',
  database: 'LDS_LIVE',
  options: { encrypt: false, trustServerCertificate: true, requestTimeout: 120000 }
};

async function safeQuery(pool, label, query) {
  try {
    const res = await pool.request().query(query);
    return res.recordset;
  } catch(e) {
    return { ERROR: e.message };
  }
}

async function run() {
  const pool = await sql.connect(config);
  const out = {};

  // 1. OWOR Schema
  out.OWOR_SCHEMA = await safeQuery(pool, 'OWOR_SCHEMA', `
    SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'OWOR' ORDER BY ORDINAL_POSITION`);

  // 2. OWOR Sample
  out.OWOR_RECENT = await safeQuery(pool, 'OWOR_RECENT', `SELECT TOP 5 * FROM LDS_LIVE.dbo.OWOR ORDER BY DocEntry DESC`);

  // 3. OWOR Status Counts
  out.OWOR_STATUS_COUNTS = await safeQuery(pool, 'OWOR_STATUS', `SELECT Status, COUNT(*) as Cnt FROM LDS_LIVE.dbo.OWOR GROUP BY Status`);

  // 4. WOR1 Schema
  out.WOR1_SCHEMA = await safeQuery(pool, 'WOR1_SCHEMA', `
    SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'WOR1' ORDER BY ORDINAL_POSITION`);

  // 5. WOR1 Sample
  out.WOR1_RECENT = await safeQuery(pool, 'WOR1_RECENT', `
    SELECT TOP 15 * FROM LDS_LIVE.dbo.WOR1
    WHERE DocEntry IN (SELECT TOP 2 DocEntry FROM LDS_LIVE.dbo.OWOR WHERE Status = 'L' ORDER BY DocEntry DESC)
    ORDER BY DocEntry DESC, LineNum`);

  // 6. WOR1 ItemType distribution
  out.WOR1_ITEM_TYPES = await safeQuery(pool, 'WOR1_TYPES', `SELECT ItemType, COUNT(*) as Cnt FROM LDS_LIVE.dbo.WOR1 GROUP BY ItemType`);

  // 7. ORSC Schema
  out.ORSC_SCHEMA = await safeQuery(pool, 'ORSC_SCHEMA', `
    SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'ORSC' ORDER BY ORDINAL_POSITION`);

  // 8. ORSC All Resources
  out.ORSC_ALL = await safeQuery(pool, 'ORSC_ALL', `SELECT * FROM LDS_LIVE.dbo.ORSC`);

  // 9. IGE1 Schema
  out.IGE1_SCHEMA = await safeQuery(pool, 'IGE1_SCHEMA', `
    SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'IGE1' ORDER BY ORDINAL_POSITION`);

  // 10. IGE1 production issues
  out.IGE1_PRODUCTION = await safeQuery(pool, 'IGE1_PROD', `
    SELECT TOP 15 * FROM LDS_LIVE.dbo.IGE1 WHERE BaseType = 202 ORDER BY DocEntry DESC`);

  // 11. IGN1 Schema
  out.IGN1_SCHEMA = await safeQuery(pool, 'IGN1_SCHEMA', `
    SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'IGN1' ORDER BY ORDINAL_POSITION`);

  // 12. IGN1 production receipts
  out.IGN1_PRODUCTION = await safeQuery(pool, 'IGN1_PROD', `
    SELECT TOP 15 * FROM LDS_LIVE.dbo.IGN1 WHERE BaseType = 202 ORDER BY DocEntry DESC`);

  // 13. Full lifecycle trace for ONE closed production order
  const recentClosed = await safeQuery(pool, 'RECENT_CLOSED', `SELECT TOP 1 * FROM LDS_LIVE.dbo.OWOR WHERE Status = 'L' ORDER BY DocEntry DESC`);
  out.TRACE_ORDER = recentClosed[0] || null;

  if (out.TRACE_ORDER && out.TRACE_ORDER.DocEntry) {
    const de = out.TRACE_ORDER.DocEntry;
    out.TRACE_WOR1 = await safeQuery(pool, 'TRACE_WOR1', `SELECT * FROM LDS_LIVE.dbo.WOR1 WHERE DocEntry = ${de} ORDER BY LineNum`);
    out.TRACE_IGE1 = await safeQuery(pool, 'TRACE_IGE1', `SELECT * FROM LDS_LIVE.dbo.IGE1 WHERE BaseEntry = ${de} AND BaseType = 202 ORDER BY DocEntry, LineNum`);
    out.TRACE_IGN1 = await safeQuery(pool, 'TRACE_IGN1', `SELECT * FROM LDS_LIVE.dbo.IGN1 WHERE BaseEntry = ${de} AND BaseType = 202 ORDER BY DocEntry, LineNum`);
  }

  // 14. UDF fields on key tables
  out.OWOR_UDF = await safeQuery(pool, 'OWOR_UDF', `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'OWOR' AND COLUMN_NAME LIKE 'U[_]%'`);
  out.WOR1_UDF = await safeQuery(pool, 'WOR1_UDF', `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'WOR1' AND COLUMN_NAME LIKE 'U[_]%'`);
  out.OITM_UDF = await safeQuery(pool, 'OITM_UDF', `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'OITM' AND COLUMN_NAME LIKE 'U[_]%'`);
  out.IGE1_UDF = await safeQuery(pool, 'IGE1_UDF', `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'IGE1' AND COLUMN_NAME LIKE 'U[_]%'`);
  out.IGN1_UDF = await safeQuery(pool, 'IGN1_UDF', `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'IGN1' AND COLUMN_NAME LIKE 'U[_]%'`);

  // 15. OITM valuation
  out.OITM_VALUATION = await safeQuery(pool, 'OITM_VAL', `
    SELECT TOP 5 * FROM LDS_LIVE.dbo.OITM
    WHERE ItemCode IN (SELECT DISTINCT TOP 5 ItemCode FROM LDS_LIVE.dbo.OWOR WHERE Status = 'L')`);

  // 16. ITM1 Price Lists
  out.ITM1_PRICE_LISTS = await safeQuery(pool, 'ITM1_PL', `
    SELECT TOP 20 * FROM LDS_LIVE.dbo.ITM1
    WHERE ItemCode = (SELECT TOP 1 ItemCode FROM LDS_LIVE.dbo.OWOR WHERE Status = 'L' ORDER BY DocEntry DESC)
    ORDER BY PriceList`);

  // 17. OPLN
  out.OPLN_PRICE_LISTS = await safeQuery(pool, 'OPLN', `SELECT * FROM LDS_LIVE.dbo.OPLN ORDER BY ListNum`);

  // 18. OITW
  out.OITW_SAMPLE = await safeQuery(pool, 'OITW', `
    SELECT TOP 10 * FROM LDS_LIVE.dbo.OITW
    WHERE ItemCode = (SELECT TOP 1 ItemCode FROM LDS_LIVE.dbo.OWOR WHERE Status = 'L' ORDER BY DocEntry DESC)`);

  // 19. WOR4
  out.WOR4_SCHEMA = await safeQuery(pool, 'WOR4_SCHEMA', `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'WOR4' ORDER BY ORDINAL_POSITION`);
  out.WOR4_COUNT = await safeQuery(pool, 'WOR4_COUNT', `SELECT COUNT(*) as C FROM LDS_LIVE.dbo.WOR4`);
  out.WOR4_SAMPLE = await safeQuery(pool, 'WOR4_SAMPLE', `SELECT TOP 5 * FROM LDS_LIVE.dbo.WOR4 ORDER BY 1 DESC`);

  // 20. WOR2
  out.WOR2_SCHEMA = await safeQuery(pool, 'WOR2_SCHEMA', `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'WOR2' ORDER BY ORDINAL_POSITION`);

  // 21. IGE22
  out.IGE22_SCHEMA = await safeQuery(pool, 'IGE22_SCHEMA', `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'IGE22' ORDER BY ORDINAL_POSITION`);
  out.IGE22_COUNT = await safeQuery(pool, 'IGE22_COUNT', `SELECT COUNT(*) as C FROM LDS_LIVE.dbo.IGE22`);
  out.IGE22_SAMPLE = await safeQuery(pool, 'IGE22_SAMPLE', `SELECT TOP 5 * FROM LDS_LIVE.dbo.IGE22 ORDER BY 1 DESC`);

  // 22. IGN22
  out.IGN22_SCHEMA = await safeQuery(pool, 'IGN22_SCHEMA', `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'IGN22' ORDER BY ORDINAL_POSITION`);
  out.IGN22_COUNT = await safeQuery(pool, 'IGN22_COUNT', `SELECT COUNT(*) as C FROM LDS_LIVE.dbo.IGN22`);
  out.IGN22_SAMPLE = await safeQuery(pool, 'IGN22_SAMPLE', `SELECT TOP 5 * FROM LDS_LIVE.dbo.IGN22 ORDER BY 1 DESC`);

  // 23. RSC4
  out.RSC4_SCHEMA = await safeQuery(pool, 'RSC4_SCHEMA', `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'RSC4' ORDER BY ORDINAL_POSITION`);
  out.RSC4_SAMPLE = await safeQuery(pool, 'RSC4_SAMPLE', `SELECT TOP 10 * FROM LDS_LIVE.dbo.RSC4 ORDER BY 1 DESC`);

  // 24. Data Quality
  out.DQ_ISSUES_NO_RECEIPT = await safeQuery(pool, 'DQ1', `
    SELECT COUNT(*) as Cnt FROM LDS_LIVE.dbo.OWOR o
    WHERE EXISTS (SELECT 1 FROM LDS_LIVE.dbo.IGE1 i WHERE i.BaseEntry = o.DocEntry AND i.BaseType = 202)
    AND NOT EXISTS (SELECT 1 FROM LDS_LIVE.dbo.IGN1 r WHERE r.BaseEntry = o.DocEntry AND r.BaseType = 202)
    AND o.Status NOT IN ('P')`);
  out.DQ_RECEIPT_NO_ISSUE = await safeQuery(pool, 'DQ2', `
    SELECT COUNT(*) as Cnt FROM LDS_LIVE.dbo.OWOR o
    WHERE NOT EXISTS (SELECT 1 FROM LDS_LIVE.dbo.IGE1 i WHERE i.BaseEntry = o.DocEntry AND i.BaseType = 202)
    AND EXISTS (SELECT 1 FROM LDS_LIVE.dbo.IGN1 r WHERE r.BaseEntry = o.DocEntry AND r.BaseType = 202)`);

  // 25. JDT1 production GL
  out.JDT1_PRODUCTION = await safeQuery(pool, 'JDT1', `
    SELECT TOP 10 * FROM LDS_LIVE.dbo.JDT1 WHERE TransType IN (59, 60) ORDER BY TransId DESC`);

  // 26. Record counts
  out.RECORD_COUNTS = await safeQuery(pool, 'COUNTS', `
    SELECT 'OWOR' as T, COUNT(*) as C FROM LDS_LIVE.dbo.OWOR
    UNION ALL SELECT 'WOR1', COUNT(*) FROM LDS_LIVE.dbo.WOR1
    UNION ALL SELECT 'OIGE', COUNT(*) FROM LDS_LIVE.dbo.OIGE
    UNION ALL SELECT 'IGE1', COUNT(*) FROM LDS_LIVE.dbo.IGE1
    UNION ALL SELECT 'OIGN', COUNT(*) FROM LDS_LIVE.dbo.OIGN
    UNION ALL SELECT 'IGN1', COUNT(*) FROM LDS_LIVE.dbo.IGN1
    UNION ALL SELECT 'ORSC', COUNT(*) FROM LDS_LIVE.dbo.ORSC
    UNION ALL SELECT 'OITM', COUNT(*) FROM LDS_LIVE.dbo.OITM
    UNION ALL SELECT 'OJDT', COUNT(*) FROM LDS_LIVE.dbo.OJDT
    UNION ALL SELECT 'JDT1', COUNT(*) FROM LDS_LIVE.dbo.JDT1
    UNION ALL SELECT 'OITT', COUNT(*) FROM LDS_LIVE.dbo.OITT
    UNION ALL SELECT 'ITT1', COUNT(*) FROM LDS_LIVE.dbo.ITT1
    UNION ALL SELECT 'OBTN', COUNT(*) FROM LDS_LIVE.dbo.OBTN
    UNION ALL SELECT 'SIVL2', COUNT(*) FROM LDS_LIVE.dbo.SIVL2
    UNION ALL SELECT 'IVL2', COUNT(*) FROM LDS_LIVE.dbo.IVL2`);

  // 27. SIVL2/IVL2
  out.SIVL2_SCHEMA = await safeQuery(pool, 'SIVL2_SCHEMA', `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'SIVL2' ORDER BY ORDINAL_POSITION`);
  out.IVL2_SCHEMA = await safeQuery(pool, 'IVL2_SCHEMA', `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'IVL2' ORDER BY ORDINAL_POSITION`);

  // 28. OITM EvalSystem distribution
  out.OITM_EVAL_SYSTEMS = await safeQuery(pool, 'EVAL', `SELECT EvalSystem, COUNT(*) as Cnt FROM LDS_LIVE.dbo.OITM GROUP BY EvalSystem`);

  // 29. OITT/ITT1 BOM
  out.OITT_SAMPLE = await safeQuery(pool, 'OITT', `SELECT TOP 3 * FROM LDS_LIVE.dbo.OITT ORDER BY 1 DESC`);
  out.ITT1_SAMPLE = await safeQuery(pool, 'ITT1', `SELECT TOP 10 * FROM LDS_LIVE.dbo.ITT1 WHERE Father = (SELECT TOP 1 Code FROM LDS_LIVE.dbo.OITT ORDER BY 1 DESC)`);

  // 30. RSC1 schema + sample
  out.RSC1_SCHEMA = await safeQuery(pool, 'RSC1_SCHEMA', `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'RSC1' ORDER BY ORDINAL_POSITION`);
  out.RSC1_SAMPLE = await safeQuery(pool, 'RSC1_SAMPLE', `SELECT TOP 10 * FROM LDS_LIVE.dbo.RSC1`);

  // 31. OHEM (employees)
  out.OHEM_SCHEMA = await safeQuery(pool, 'OHEM_SCHEMA', `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'OHEM' ORDER BY ORDINAL_POSITION`);
  out.OHEM_COUNT = await safeQuery(pool, 'OHEM_COUNT', `SELECT COUNT(*) as C FROM LDS_LIVE.dbo.OHEM`);

  fs.writeFileSync('discovery_deep.json', JSON.stringify(out, null, 2));
  console.log('Deep discovery complete. Saved to discovery_deep.json');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
