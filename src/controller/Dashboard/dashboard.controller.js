const { sql, poolPromise } = require('../../database/connection');

// Helper for filtering
function buildWhereClause(query, request, tableAlias = 'p') {
  const { dateFrom, dateTo, warehouse } = query;
  let conditions = [];

  if (dateFrom) {
    conditions.push(`${tableAlias}.PostDate >= @dateFrom`);
    request.input('dateFrom', sql.DateTime, new Date(dateFrom));
  }
  if (dateTo) {
    conditions.push(`${tableAlias}.PostDate <= @dateTo`);
    request.input('dateTo', sql.DateTime, new Date(dateTo));
  }
  if (warehouse) {
    conditions.push(`${tableAlias}.Warehouse = @warehouse`);
    request.input('warehouse', sql.NVarChar, warehouse);
  }

  return conditions.length > 0 ? ' AND ' + conditions.join(' AND ') : '';
}

exports.getOverviewData = async (req, res) => {
  try {
    const pool = await poolPromise;
    const request = pool.request();
    
    // Parse global filters
    const whereClause = buildWhereClause(req.query, request, 'o');
    const invWhere = req.query.warehouse ? `AND iw.WhsCode = '${req.query.warehouse}'` : '';
    
    // 1. Executive KPIs (Production & Cost)
    const kpiQuery = `
      SELECT 
        COUNT(o.DocEntry) as TotalOrders,
        SUM(CASE WHEN o.Status = 'R' THEN 1 ELSE 0 END) as ActiveOrders,
        SUM(CASE WHEN o.Status = 'P' THEN 1 ELSE 0 END) as PlannedOrders,
        SUM(CASE WHEN o.Status = 'C' THEN 1 ELSE 0 END) as CancelledOrders,
        SUM(CASE WHEN o.Status = 'L' THEN 1 ELSE 0 END) as ClosedOrders,
        SUM(CASE WHEN o.Status IN ('R', 'P') AND o.DueDate < CAST(GETDATE() AS DATE) AND o.CmpltQty < o.PlannedQty THEN 1 ELSE 0 END) as DelayedOrders,
        ISNULL(SUM(CASE WHEN o.Status IN ('R', 'P', 'L') THEN o.PlannedQty ELSE 0 END), 0) as TotalPlannedQty,
        ISNULL((SELECT SUM(Quantity) FROM LDS_LIVE.dbo.IGN1 WHERE BaseType = 202 ${whereClause.replace('o.', '')}), 0) as TotalActualQty
        -- ISNULL((SELECT SUM(LineTotal) FROM LDS_LIVE.dbo.IGE1 WHERE BaseType = 202 ${whereClause.replace('o.', '')}), 0) as TotalActualCost
      FROM LDS_LIVE.dbo.OWOR o
      WHERE o.Status IN ('R', 'P', 'L', 'C') ${whereClause}
    `;

    // 2. Inventory Health KPIs
    const invKpiQuery = `
      SELECT
        -- ISNULL(SUM(iw.OnHand * CASE WHEN m.AvgPrice > 0 THEN m.AvgPrice ELSE 0 END), 0) AS TotalInventoryValue,
        COUNT(DISTINCT CASE WHEN iw.OnHand <= 0 THEN iw.ItemCode END) AS OutOfStockItems,
        COUNT(DISTINCT CASE WHEN iw.MinStock > 0 AND (iw.OnHand - iw.IsCommited) < iw.MinStock THEN iw.ItemCode END) AS CriticalItems
      FROM LDS_LIVE.dbo.OITW iw
      INNER JOIN LDS_LIVE.dbo.OITM m ON iw.ItemCode = m.ItemCode
      WHERE (iw.OnHand <> 0 OR iw.IsCommited <> 0 OR iw.OnOrder <> 0) ${invWhere}
    `;

    // 3. Machine Efficiency (Global Avg)
    const machineQuery = `
      SELECT 
          ISNULL((SELECT SUM(Capacity) FROM LDS_LIVE.dbo.ORCJ WHERE CapType = 'C'), 0) AS AvailableHrs,
          ISNULL(SUM(mo.ConsumedMachineHrs), 0) AS ConsumedHrs
      FROM LDS_LIVE.dbo.ORSC m
      LEFT JOIN (
          SELECT r.ItemCode AS Machine, SUM(r.IssuedQty) AS ConsumedMachineHrs
          FROM LDS_LIVE.dbo.WOR1 r
          INNER JOIN LDS_LIVE.dbo.OWOR p ON r.DocEntry = p.DocEntry
          WHERE r.ItemType = 290 AND p.Status IN ('R', 'L')
          GROUP BY r.ItemCode
      ) mo ON m.ResCode = mo.Machine
      WHERE m.ResType = 'O'
    `;

    // 4. Production Performance (Trend Chart - Last 6 Months)
    const trendQuery = `
      SELECT 
        YEAR(o.PostDate) as Year,
        MONTH(o.PostDate) as Month,
        COUNT(o.DocEntry) as OrderCount,
        SUM(o.PlannedQty) as PlannedQty
      FROM LDS_LIVE.dbo.OWOR o
      WHERE o.PostDate >= DATEADD(month, -6, GETDATE())
      GROUP BY YEAR(o.PostDate), MONTH(o.PostDate)
      ORDER BY Year, Month
    `;

    // 5. Recent Production Orders (Top 5)
    const recentOrdersQuery = `
      SELECT TOP 5
        o.DocNum,
        o.ItemCode as ProductCode,
        i.ItemName as ProductName,
        o.Status,
        o.PlannedQty,
        ISNULL((SELECT SUM(Quantity) FROM LDS_LIVE.dbo.IGN1 WHERE BaseEntry = o.DocEntry AND BaseType = 202), 0) as ActualQty,
        o.PostDate,
        o.DueDate
      FROM LDS_LIVE.dbo.OWOR o
      LEFT JOIN LDS_LIVE.dbo.OITM i ON o.ItemCode = i.ItemCode
      ORDER BY o.DocNum DESC
    `;

    // 6. Open Orders Details
    const openOrdersQuery = `
      SELECT
        o.DocNum,
        i.ItemName as ProductName,
        o.Status,
        o.PlannedQty,
        ISNULL((SELECT SUM(Quantity) FROM LDS_LIVE.dbo.IGN1 WHERE BaseEntry = o.DocEntry AND BaseType = 202), 0) as ActualQty,
        o.DueDate
      FROM LDS_LIVE.dbo.OWOR o
      LEFT JOIN LDS_LIVE.dbo.OITM i ON o.ItemCode = i.ItemCode
      WHERE o.Status IN ('P', 'R') ${whereClause}
      ORDER BY o.DueDate ASC
    `;

    // Run all queries concurrently
    const [
      kpiResult,
      invKpiResult,
      machineResult,
      trendResult,
      recentOrdersResult,
      openOrdersDetailsResult,
      expiryResult
    ] = await Promise.all([
      request.query(kpiQuery),
      pool.request().query(invKpiQuery), // separate request for separate parameters/scope
      pool.request().query(machineQuery),
      pool.request().query(trendQuery),
      pool.request().query(recentOrdersQuery),
      request.query(openOrdersQuery),
      pool.request().query(`
        SELECT
          COUNT(DISTINCT CASE WHEN b.ExpDate IS NOT NULL AND b.ExpDate >= GETDATE() AND b.ExpDate <= DATEADD(DAY, 30, GETDATE()) THEN CONCAT(b.ItemCode, '-', b.DistNumber) END) AS Expiring30Days,
          COUNT(DISTINCT CASE WHEN b.ExpDate IS NOT NULL AND b.ExpDate > DATEADD(DAY, 30, GETDATE()) AND b.ExpDate <= DATEADD(DAY, 90, GETDATE()) THEN CONCAT(b.ItemCode, '-', b.DistNumber) END) AS Expiring90Days
        FROM LDS_LIVE.dbo.OBTN b
        INNER JOIN LDS_LIVE.dbo.OBTQ q ON b.ItemCode = q.ItemCode AND b.SysNumber = q.SysNumber
        WHERE q.Quantity > 0 ${req.query.warehouse ? `AND q.WhsCode = '${req.query.warehouse}'` : ''}
      `)
    ]);

    // Process and shape the data
    const kpiData = kpiResult.recordset[0] || {};
    const invData = invKpiResult.recordset[0] || {};
    const machData = machineResult.recordset[0] || {};
    const expiryData = expiryResult.recordset[0] || {};

    const efficiencyPercent = kpiData.TotalPlannedQty > 0 ? (kpiData.TotalActualQty / kpiData.TotalPlannedQty) * 100 : 0;
    const machineUtilization = machData.AvailableHrs > 0 ? (machData.ConsumedHrs / machData.AvailableHrs) * 100 : (machData.ConsumedHrs > 0 ? 100 : 0);

    const dashboardResponse = {
      executiveKPIs: {
        totalOrders: kpiData.TotalOrders || 0,
        activeOrders: kpiData.ActiveOrders || 0,
        // totalInventoryValue: invData.TotalInventoryValue || 0,
        machineUtilization: parseFloat(machineUtilization).toFixed(1),
        yieldPercent: parseFloat(efficiencyPercent).toFixed(1),
        outOfStockItems: invData.OutOfStockItems || 0,
        delayedOrders: kpiData.DelayedOrders || 0,
        cancelledOrders: kpiData.CancelledOrders || 0,
        plannedOrders: kpiData.PlannedOrders || 0,
        closedOrders: kpiData.ClosedOrders || 0
        // totalActualCost: kpiData.TotalActualCost || 0
      },
      productionPerformance: trendResult.recordset,
      inventoryHealth: {
        critical: invData.CriticalItems || 0,
        outOfStock: invData.OutOfStockItems || 0,
        expiring30Days: expiryData.Expiring30Days || 0,
        expiring90Days: expiryData.Expiring90Days || 0
      },
      recentOrders: recentOrdersResult.recordset,
      // productionMix: mixResult.recordset,
      openOrdersDetails: openOrdersDetailsResult.recordset,
      alerts: [
        ...(invData.OutOfStockItems > 0 ? [{ id: 1, type: 'critical', title: 'Out of Stock', description: `${invData.OutOfStockItems} items are currently out of stock.` }] : []),
        ...(invData.CriticalItems > 0 ? [{ id: 2, type: 'warning', title: 'Critical Stock Level', description: `${invData.CriticalItems} items have fallen below minimum stock levels.` }] : []),
        ...(machineUtilization < 50 ? [{ id: 3, type: 'warning', title: 'Low Machine Utilization', description: 'Overall machine utilization is below 50%.' }] : []),
        ...(expiryData.Expiring30Days > 0 ? [{ id: 4, type: 'warning', title: 'Expiring Batches', description: `${expiryData.Expiring30Days} batches are expiring within 30 days.` }] : [])
      ]
    };

    res.status(200).json({
      success: true,
      data: dashboardResponse
    });

  } catch (error) {
    console.error("Error generating dashboard overview:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getFilteredOrders = async (req, res) => {
  try {
    const { status = 'All', tableDateFilter = 'today', volumeDateFilter = 'yearly', warehouse } = req.query;
    const pool = await poolPromise;
    const request = pool.request();

    // Helper function to build date conditions
    const buildDateCondition = (filter, prefix) => {
      if (filter === 'today') return `${prefix}.PostDate >= CAST(GETDATE() AS DATE)`;
      if (filter === 'weekly') return `${prefix}.PostDate >= DATEADD(day, -7, CAST(GETDATE() AS DATE))`;
      if (filter === 'monthly') return `${prefix}.PostDate >= DATEADD(month, -1, CAST(GETDATE() AS DATE))`;
      if (filter === 'yearly') return `${prefix}.PostDate >= DATEADD(year, -1, CAST(GETDATE() AS DATE))`;
      return '1=1';
    };

    // 1. Build Date Filter for the Orders List
    let tableDateCondition = buildDateCondition(tableDateFilter, 'o');

    // 2. Build Status Filter for the Orders List
    let statusCondition = '';
    if (status === 'Delayed') {
      statusCondition = "o.Status IN ('P', 'R') AND o.DueDate < CAST(GETDATE() AS DATE) AND o.CmpltQty < o.PlannedQty";
    } else if (status !== 'All') {
      statusCondition = "o.Status = @status";
      request.input('status', sql.NVarChar, status);
    } else {
      statusCondition = "o.Status IN ('R', 'L', 'C', 'P')";
    }

    // 3. Build Warehouse Filter
    let whsCondition = '';
    if (warehouse) {
      whsCondition = "o.Warehouse = @warehouse";
      request.input('warehouse', sql.NVarChar, warehouse);
    }

    const whereClauses = [tableDateCondition, statusCondition, whsCondition].filter(c => c !== '').join(' AND ');
    const finalWhere = whereClauses ? `WHERE ${whereClauses}` : '';

    const ordersQuery = `
      SELECT
        o.DocNum,
        i.ItemName as ProductName,
        o.Status,
        o.PlannedQty,
        ISNULL((SELECT SUM(Quantity) FROM LDS_LIVE.dbo.IGN1 WHERE BaseEntry = o.DocEntry AND BaseType = 202), 0) as ActualQty,
        o.DueDate,
        o.PostDate
      FROM LDS_LIVE.dbo.OWOR o
      LEFT JOIN LDS_LIVE.dbo.OITM i ON o.ItemCode = i.ItemCode
      ${finalWhere}
      ORDER BY o.PostDate DESC, o.DocNum DESC
    `;

    // 4. Order Volume Summary (Breakdown by status for the selected timeframe)
    // We ignore the statusFilter so the donut chart always shows the full breakdown for the selected date range.
    let volumeDateCondition = buildDateCondition(volumeDateFilter, 'o');
    const volumeWhereClauses = [
      volumeDateCondition !== '1=1' ? volumeDateCondition : '', 
      whsCondition,
      "o.Status IN ('R', 'L', 'C', 'P')"
    ].filter(c => c !== '').join(' AND ');

    const volumeQuery = `
      SELECT
        SUM(CASE WHEN o.Status = 'R' THEN 1 ELSE 0 END) as ReleasedCount,
        SUM(CASE WHEN o.Status = 'L' THEN 1 ELSE 0 END) as ClosedCount,
        SUM(CASE WHEN o.Status = 'C' THEN 1 ELSE 0 END) as CancelledCount,
        SUM(CASE WHEN o.Status = 'P' THEN 1 ELSE 0 END) as PlannedCount,
        SUM(CASE WHEN o.Status IN ('P', 'R') AND o.DueDate < CAST(GETDATE() AS DATE) AND o.CmpltQty < o.PlannedQty THEN 1 ELSE 0 END) as DelayedCount
      FROM LDS_LIVE.dbo.OWOR o
      WHERE ${volumeWhereClauses}
    `;

    const [ordersResult, volumeResult] = await Promise.all([
      request.query(ordersQuery),
      pool.request().query(volumeQuery)
    ]);

    res.status(200).json({
      success: true,
      data: {
        orders: ordersResult.recordset,
        volume: volumeResult.recordset[0]
      }
    });

  } catch (error) {
    console.error("Error in getFilteredOrders:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
