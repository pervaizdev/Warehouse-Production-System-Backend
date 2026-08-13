const sql = require('mssql');
const fs = require('fs');

const config = {
  user: 'sa',
  password: 'AdmTsg@2020',
  server: '115.186.130.76',
  database: 'LDS_LIVE', // Try LDS_LIVE directly to see if it works, or HCM_GMS
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

async function runDiscovery() {
  try {
    const pool = await sql.connect(config);
    const results = {};

    // 1. Check which target tables exist
    const targetTables = [
      'OWOR', 'WOR1', 'WOR2', 'WOR4', 
      'OITM', 'OITW', 'OITL', 
      'OITT', 'ITT1', 'ITT2',
      'ORSC', 'ORCJ', 'RSC1', 'RSC4', 'OHEM',
      'OIGE', 'IGE1', 'IGE22',
      'OIGN', 'IGN1', 'IGN22',
      'SIVL2', 'IVL2',
      'OBTN', 'OBTQ', 'OBTW', 'OSRN', 'USRN',
      'OPLN', 'ITM1',
      'OJDT', 'JDT1'
    ];

    const tablesQuery = `
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = 'dbo' 
      AND TABLE_NAME IN (${targetTables.map(t => `'${t}'`).join(',')})
    `;
    const tablesRes = await pool.request().query(tablesQuery);
    const existingTables = tablesRes.recordset.map(r => r.TABLE_NAME);
    results.existingTables = existingTables;

    // 2. Fetch schema columns for key tables
    const schemaQuery = `
      SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = 'dbo' 
      AND TABLE_NAME IN ('OWOR', 'WOR1', 'IGE1', 'IGN1', 'OITM', 'SIVL2', 'IVL2', 'OJDT', 'JDT1')
    `;
    const schemaRes = await pool.request().query(schemaQuery);
    const schemas = {};
    schemaRes.recordset.forEach(r => {
      if (!schemas[r.TABLE_NAME]) schemas[r.TABLE_NAME] = [];
      schemas[r.TABLE_NAME].push(`${r.COLUMN_NAME} (${r.DATA_TYPE}${r.CHARACTER_MAXIMUM_LENGTH ? '('+r.CHARACTER_MAXIMUM_LENGTH+')' : ''})`);
    });
    results.schemas = schemas;

    fs.writeFileSync('discovery_results.json', JSON.stringify(results, null, 2));
    console.log('Discovery complete. Saved to discovery_results.json');
    process.exit(0);
  } catch (err) {
    console.error('Discovery failed:', err);
    process.exit(1);
  }
}

runDiscovery();
