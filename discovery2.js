const sql = require('mssql');
const fs = require('fs');

const config = {
  user: 'sa',
  password: 'AdmTsg@2020',
  server: '115.186.130.76',
  database: 'LDS_LIVE',
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

async function runDiscovery() {
  try {
    const pool = await sql.connect(config);
    const results = {};
    const keyTables = ['OWOR', 'WOR1', 'OIGE', 'IGE1', 'OIGN', 'IGN1', 'ORSC', 'OITM'];
    
    for (const table of keyTables) {
      try {
        const query = `SELECT TOP 2 * FROM LDS_LIVE.dbo.${table} ORDER BY 1 DESC`;
        const res = await pool.request().query(query);
        results[table] = res.recordset;
      } catch (e) {
        results[table] = { error: e.message };
      }
    }

    fs.writeFileSync('sample_data.json', JSON.stringify(results, null, 2));
    console.log('Sample data saved to sample_data.json');
    process.exit(0);
  } catch (err) {
    console.error('Failed:', err);
    process.exit(1);
  }
}

runDiscovery();
