const { sql, poolPromise } = require('../../database/connection');

exports.getMachineEfficiency = async (req, res) => {
  try {
    const { dateFrom, dateTo, machine, order, product, status, warehouse } = req.query;
    
    let whereClause = "WHERE m.ResType = 'O'";
    let oWhereClause = "WHERE 1=1";
    let orderWhereClause = "WHERE 1=1";
    
    if (machine) whereClause += ` AND m.ResCode = @machine`;
    
    // Filters for Production Orders (OWOR)
    if (dateFrom) orderWhereClause += ` AND p.PostDate >= @dateFrom`;
    if (dateTo) orderWhereClause += ` AND p.PostDate <= @dateTo`;
    if (order) orderWhereClause += ` AND p.DocNum = @order`;
    if (product) orderWhereClause += ` AND p.ItemCode = @product`;
    if (status) orderWhereClause += ` AND p.Status = @status`;
    if (warehouse) orderWhereClause += ` AND p.Warehouse = @warehouse`;

    const pool = await poolPromise;
    const request = pool.request();
    
    if (machine) request.input('machine', sql.NVarChar, machine);
    if (dateFrom) request.input('dateFrom', sql.Date, dateFrom);
    if (dateTo) request.input('dateTo', sql.Date, dateTo);
    if (order) request.input('order', sql.Int, parseInt(order));
    if (product) request.input('product', sql.NVarChar, product);
    if (status) request.input('status', sql.Char, status);
    if (warehouse) request.input('warehouse', sql.NVarChar, warehouse);

    const query = `
      WITH MachineOrders AS (
          SELECT 
              r.ItemCode AS Machine,
              r.DocEntry AS OrderEntry,
              SUM(r.PlannedQty) AS PlannedMachineHrs,
              SUM(r.IssuedQty) AS ConsumedMachineHrs
          FROM LDS_LIVE.dbo.WOR1 r
          INNER JOIN LDS_LIVE.dbo.OWOR p ON r.DocEntry = p.DocEntry
          ${orderWhereClause} AND r.ItemType = 290
          GROUP BY r.ItemCode, r.DocEntry
      ),
      OrderOutput AS (
          SELECT 
              p.DocEntry,
              p.Status,
              p.PlannedQty AS PlannedOutputQty,
              ISNULL((SELECT SUM(Quantity) FROM LDS_LIVE.dbo.IGN1 WHERE BaseEntry = p.DocEntry AND BaseType = 202), 0) AS ActualOutputQty
          FROM LDS_LIVE.dbo.OWOR p
          ${orderWhereClause}
      )
      SELECT 
          m.ResCode AS Machine,
          m.ResName AS MachineName,
          ISNULL((SELECT SUM(Capacity) FROM LDS_LIVE.dbo.ORCJ WHERE ResCode = m.ResCode AND CapType = 'C'), 0) AS AvailableHrs,
          ISNULL(SUM(mo.ConsumedMachineHrs), 0) AS ConsumedHrs,
          ISNULL(SUM(mo.PlannedMachineHrs), 0) AS PlannedHrs,
          ISNULL(SUM(oo.ActualOutputQty), 0) AS OutputQty,
          ISNULL(SUM(oo.PlannedOutputQty), 0) AS PlannedOutputQty,
          COUNT(DISTINCT mo.OrderEntry) AS TotalOrders,
          SUM(CASE WHEN oo.Status = 'R' THEN 1 ELSE 0 END) AS ActiveOrders,
          SUM(CASE WHEN oo.Status = 'L' THEN 1 ELSE 0 END) AS ClosedOrders
      FROM LDS_LIVE.dbo.ORSC m
      LEFT JOIN MachineOrders mo ON m.ResCode = mo.Machine
      LEFT JOIN OrderOutput oo ON mo.OrderEntry = oo.DocEntry
      ${whereClause}
      GROUP BY m.ResCode, m.ResName;
    `;

    const result = await request.query(query);
    
    let activeOrdersCount = 0;
    let closedOrdersCount = 0;
    let totalOrdersCount = 0;

    const dashboardData = result.recordset.map(row => {
      // If SAP B1 capacity (ORCJ) is not maintained, fallback to Planned Machine Hrs
      const effectiveAvailableHrs = row.AvailableHrs > 0 ? row.AvailableHrs : row.PlannedHrs;
      
      const remainingHrs = effectiveAvailableHrs - row.ConsumedHrs;
      const utilization = effectiveAvailableHrs > 0 ? (row.ConsumedHrs / effectiveAvailableHrs) * 100 : 0;
      const qtyPerHour = row.ConsumedHrs > 0 ? (row.OutputQty / row.ConsumedHrs) : 0;
      const efficiency = row.PlannedOutputQty > 0 ? (row.OutputQty / row.PlannedOutputQty) * 100 : 0;
      const hourVariance = row.ConsumedHrs - row.PlannedHrs;
      
      activeOrdersCount += row.ActiveOrders || 0;
      closedOrdersCount += row.ClosedOrders || 0;
      totalOrdersCount += row.TotalOrders || 0;

      return {
        machine: row.MachineName || row.Machine,
        machineCode: row.Machine,
        availableHrs: parseFloat(effectiveAvailableHrs).toFixed(2),
        consumedHrs: parseFloat(row.ConsumedHrs).toFixed(2),
        remainingHrs: parseFloat(remainingHrs).toFixed(2),
        utilization: utilization.toFixed(2),
        outputQty: parseFloat(row.OutputQty).toFixed(2),
        plannedOutputQty: parseFloat(row.PlannedOutputQty).toFixed(2),
        qtyPerHour: qtyPerHour.toFixed(2),
        efficiency: efficiency.toFixed(2),
        hourVariance: parseFloat(hourVariance).toFixed(2)
      };
    });

    // Calculate global KPIs
    const totalAvailable = dashboardData.reduce((sum, row) => sum + parseFloat(row.availableHrs), 0);
    const totalConsumed = dashboardData.reduce((sum, row) => sum + parseFloat(row.consumedHrs), 0);
    const globalUtilization = totalAvailable > 0 ? (totalConsumed / totalAvailable) * 100 : 0;
    
    const totalPlannedOutput = dashboardData.reduce((sum, row) => sum + parseFloat(row.plannedOutputQty), 0);
    const totalOutput = dashboardData.reduce((sum, row) => sum + parseFloat(row.outputQty), 0);
    const globalEfficiency = totalPlannedOutput > 0 ? (totalOutput / totalPlannedOutput) * 100 : 0;
    const globalQtyPerHour = totalConsumed > 0 ? (totalOutput / totalConsumed) : 0;

    // Pagination (In-memory since the grouped list is small)
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const startIndex = (page - 1) * limit;
    const paginatedData = dashboardData.slice(startIndex, startIndex + limit);

    res.status(200).json({
      success: true,
      data: paginatedData,
      chartData: dashboardData,
      summary: {
        activeOrders: activeOrdersCount,
        closedOrders: closedOrdersCount,
        totalOrders: totalOrdersCount,
        totalAvailable,
        totalConsumed,
        globalUtilization,
        totalPlannedOutput,
        totalOutput,
        globalEfficiency,
        globalQtyPerHour
      },
      pagination: {
        page,
        limit,
        totalItems: dashboardData.length,
        totalPages: Math.ceil(dashboardData.length / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching machine efficiency:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch machine efficiency data'
    });
  }
};

exports.getFilterOptions = async (req, res) => {
  try {
    const pool = await poolPromise;
    
    // Fetch unique machines
    const machinesQuery = `SELECT ResCode AS value, ResName AS label FROM LDS_LIVE.dbo.ORSC WHERE ResType = 'O'`;
    // Fetch unique products (items that are produced)
    const productsQuery = `SELECT DISTINCT ItemCode AS value, ItemName AS label FROM LDS_LIVE.dbo.OITM WHERE TreeType = 'P'`;
    // Fetch unique warehouses
    const warehousesQuery = `SELECT WhsCode AS value, WhsName AS label FROM LDS_LIVE.dbo.OWHS`;

    const [machinesResult, productsResult, warehousesResult] = await Promise.all([
      pool.request().query(machinesQuery),
      pool.request().query(productsQuery),
      pool.request().query(warehousesQuery)
    ]);

    res.status(200).json({
      success: true,
      data: {
        machines: machinesResult.recordset,
        products: productsResult.recordset,
        warehouses: warehousesResult.recordset,
        statuses: [
          { value: 'P', label: 'Planned' },
          { value: 'R', label: 'Released' },
          { value: 'L', label: 'Closed' },
          { value: 'C', label: 'Canceled' }
        ]
      }
    });
  } catch (error) {
    console.error('Error fetching filter options:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch filter options'
    });
  }
};

exports.getMachineDrilldown = async (req, res) => {
  try {
    const { machineId } = req.params;
    const pool = await poolPromise;
    
    // We want the production orders that used this machine
    const query = `
      SELECT 
          p.DocNum AS OrderNum,
          p.Status,
          p.ItemCode AS ProductCode,
          i.ItemName AS ProductDescription,
          p.PlannedQty,
          ISNULL((SELECT SUM(Quantity) FROM LDS_LIVE.dbo.IGN1 WHERE BaseEntry = p.DocEntry AND BaseType = 202), 0) AS ActualQty,
          SUM(r.PlannedQty) AS PlannedHrs,
          SUM(r.IssuedQty) AS ConsumedHrs
      FROM LDS_LIVE.dbo.OWOR p
      INNER JOIN LDS_LIVE.dbo.WOR1 r ON p.DocEntry = r.DocEntry
      LEFT JOIN LDS_LIVE.dbo.OITM i ON p.ItemCode = i.ItemCode
      WHERE r.ItemCode = @machineId AND r.ItemType = 290
      GROUP BY p.DocNum, p.Status, p.ItemCode, i.ItemName, p.PlannedQty, p.DocEntry
      ORDER BY p.DocNum DESC
    `;

    const request = pool.request();
    request.input('machineId', sql.NVarChar, machineId);
    
    const result = await request.query(query);
    
    const orders = result.recordset.map(row => {
      const remainingHrs = row.PlannedHrs - row.ConsumedHrs;
      const efficiency = row.PlannedQty > 0 ? (row.ActualQty / row.PlannedQty) * 100 : 0;
      
      let statusStr = row.Status;
      if (row.Status === 'R') statusStr = 'Released';
      if (row.Status === 'L') statusStr = 'Closed';
      if (row.Status === 'P') statusStr = 'Planned';
      if (row.Status === 'C') statusStr = 'Canceled';

      return {
        orderNum: row.OrderNum,
        status: statusStr,
        product: row.ProductCode,
        productName: row.ProductDescription,
        plannedQty: parseFloat(row.PlannedQty).toFixed(2),
        actualQty: parseFloat(row.ActualQty).toFixed(2),
        plannedHrs: parseFloat(row.PlannedHrs).toFixed(2),
        consumedHrs: parseFloat(row.ConsumedHrs).toFixed(2),
        remainingHrs: parseFloat(remainingHrs).toFixed(2),
        efficiency: efficiency.toFixed(2)
      };
    });

    res.status(200).json({
      success: true,
      data: orders
    });
  } catch (error) {
    console.error('Error fetching machine drilldown:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch machine drilldown'
    });
  }
};

exports.getOrderDrilldown = async (req, res) => {
  try {
    const { orderNum } = req.params;
    const pool = await poolPromise;
    
    const query = `
      SELECT 
          p.DocNum AS OrderNum,
          p.Status,
          p.ItemCode AS ProductCode,
          i.ItemName AS ProductDescription,
          p.PlannedQty,
          ISNULL((SELECT SUM(Quantity) FROM LDS_LIVE.dbo.IGN1 WHERE BaseEntry = p.DocEntry AND BaseType = 202), 0) AS ActualQty,
          p.PostDate AS StartDate,
          p.DueDate
      FROM LDS_LIVE.dbo.OWOR p
      LEFT JOIN LDS_LIVE.dbo.OITM i ON p.ItemCode = i.ItemCode
      WHERE p.DocNum = @orderNum
    `;

    const request = pool.request();
    request.input('orderNum', sql.Int, parseInt(orderNum));
    
    const result = await request.query(query);
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const orderData = result.recordset[0];
    const efficiency = orderData.PlannedQty > 0 ? (orderData.ActualQty / orderData.PlannedQty) * 100 : 0;
    
    let statusStr = orderData.Status;
    if (orderData.Status === 'R') statusStr = 'Released';
    if (orderData.Status === 'L') statusStr = 'Closed';
    if (orderData.Status === 'P') statusStr = 'Planned';
    if (orderData.Status === 'C') statusStr = 'Canceled';

    // Mock costs for now as SAP costing setup is complex and varies
    const mockMachineCost = 1500;
    const mockMaterialCost = 5000;
    const totalCost = mockMachineCost + mockMaterialCost;

    res.status(200).json({
      success: true,
      data: {
        orderInfo: {
          orderNum: orderData.OrderNum,
          status: statusStr,
          productCode: orderData.ProductCode,
          productName: orderData.ProductDescription,
          plannedQty: parseFloat(orderData.PlannedQty).toFixed(2),
          actualQty: parseFloat(orderData.ActualQty).toFixed(2),
          efficiency: efficiency.toFixed(2),
          startDate: orderData.StartDate,
          dueDate: orderData.DueDate
        },
        costs: {
          machineCost: mockMachineCost.toFixed(2),
          materialCost: mockMaterialCost.toFixed(2),
          totalCost: totalCost.toFixed(2),
          costPerUnit: (totalCost / (orderData.ActualQty || 1)).toFixed(2)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching order drilldown:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order drilldown'
    });
  }
};
