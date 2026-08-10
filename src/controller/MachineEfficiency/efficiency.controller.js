const { sql, poolPromise } = require('../../database/connection');

exports.getMachineEfficiency = async (req, res) => {
  try {
    const pool = await poolPromise;
    const query = `
      WITH MachineOrders AS (
          SELECT 
              r.ItemCode AS Machine,
              r.DocEntry AS OrderEntry,
              SUM(r.PlannedQty) AS PlannedMachineHrs,
              SUM(r.IssuedQty) AS ConsumedMachineHrs
          FROM LDS_LIVE.dbo.WOR1 r
          WHERE r.ItemType = 290
          GROUP BY r.ItemCode, r.DocEntry
      ),
      OrderOutput AS (
          SELECT 
              p.DocEntry,
              p.PlannedQty AS PlannedOutputQty,
              ISNULL((SELECT SUM(Quantity) FROM LDS_LIVE.dbo.IGN1 WHERE BaseEntry = p.DocEntry AND BaseType = 202), 0) AS ActualOutputQty
          FROM LDS_LIVE.dbo.OWOR p
      )
      SELECT 
          m.ResCode AS Machine,
          m.ResName AS MachineName,
          ISNULL((SELECT SUM(Capacity) FROM LDS_LIVE.dbo.ORCJ WHERE ResCode = m.ResCode AND CapType = 'C'), 0) AS AvailableHrs,
          ISNULL(SUM(mo.ConsumedMachineHrs), 0) AS ConsumedHrs,
          ISNULL(SUM(mo.PlannedMachineHrs), 0) AS PlannedHrs,
          ISNULL(SUM(oo.ActualOutputQty), 0) AS OutputQty,
          ISNULL(SUM(oo.PlannedOutputQty), 0) AS PlannedOutputQty
      FROM LDS_LIVE.dbo.ORSC m
      LEFT JOIN MachineOrders mo ON m.ResCode = mo.Machine
      LEFT JOIN OrderOutput oo ON mo.OrderEntry = oo.DocEntry
      WHERE m.ResType = 'O'
      GROUP BY m.ResCode, m.ResName;
    `;

    const result = await pool.request().query(query);
    
    // Process results to calculate final KPIs per the dashboard requirements
    const dashboardData = result.recordset.map(row => {
      const remainingHrs = row.AvailableHrs - row.ConsumedHrs;
      const utilization = row.AvailableHrs > 0 ? (row.ConsumedHrs / row.AvailableHrs) * 100 : 0;
      const qtyPerHour = row.ConsumedHrs > 0 ? (row.OutputQty / row.ConsumedHrs) : 0;
      const efficiency = row.PlannedOutputQty > 0 ? (row.OutputQty / row.PlannedOutputQty) * 100 : 0;
      const hourVariance = row.ConsumedHrs - row.PlannedHrs;

      return {
        machine: row.MachineName || row.Machine,
        machineCode: row.Machine,
        availableHrs: parseFloat(row.AvailableHrs).toFixed(2),
        consumedHrs: parseFloat(row.ConsumedHrs).toFixed(2),
        remainingHrs: parseFloat(remainingHrs).toFixed(2),
        utilization: utilization.toFixed(2),
        outputQty: parseFloat(row.OutputQty).toFixed(2),
        qtyPerHour: qtyPerHour.toFixed(2),
        efficiency: efficiency.toFixed(2),
        hourVariance: parseFloat(hourVariance).toFixed(2)
      };
    });

    res.status(200).json({
      success: true,
      data: dashboardData
    });
  } catch (error) {
    console.error('Error fetching machine efficiency:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch machine efficiency data'
    });
  }
};
