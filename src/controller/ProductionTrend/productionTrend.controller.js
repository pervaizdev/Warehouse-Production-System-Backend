const { sql, poolPromise } = require('../../database/connection');

// Helper to construct WHERE conditions for Order KPIs based on query params (using OWOR.PostDate)
function buildOrderWhereClause(query, request) {
  const { dateFrom, dateTo, year, month, product, productGroup, warehouse, order, machine, status } = query;
  let conditions = [];

  // We rely on parameters already being added to the request object by the main buildWhereClause if they share names.
  // We just need to build the SQL string.
  
  if (dateFrom) conditions.push("p.PostDate >= @dateFrom");
  if (dateTo) conditions.push("p.PostDate <= @dateTo");
  if (year) conditions.push("YEAR(p.PostDate) = @year");
  if (month) conditions.push("MONTH(p.PostDate) = @month");
  if (product) conditions.push("p.ItemCode = @product");
  if (productGroup) conditions.push("m.ItmsGrpCod = @productGroup");
  if (warehouse) conditions.push("p.Warehouse = @warehouse");
  if (order) conditions.push("p.DocNum = @order");
  if (status) conditions.push("p.Status = @status");
  
  if (machine) {
    conditions.push(`EXISTS (
      SELECT 1 FROM LDS_LIVE.dbo.WOR1 w 
      INNER JOIN LDS_LIVE.dbo.ORSC r ON w.ItemCode = r.ResCode 
      WHERE w.DocEntry = p.DocEntry AND w.ItemType = 290 AND r.ResCode = @machine
    )`);
  }

  return conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
}

// Helper to construct WHERE conditions based on query params
function buildWhereClause(query, request) {
  const {
    dateFrom,
    dateTo,
    year,
    month,
    product,
    productGroup,
    warehouse,
    order,
    machine,
    status
  } = query;

  let conditions = ["i.BaseType = 202", "h.CANCELED = 'N'"];

  if (dateFrom) {
    conditions.push("h.DocDate >= @dateFrom");
    request.input('dateFrom', sql.Date, dateFrom);
  }

  if (dateTo) {
    conditions.push("h.DocDate <= @dateTo");
    request.input('dateTo', sql.Date, dateTo);
  }

  if (year) {
    conditions.push("YEAR(h.DocDate) = @year");
    request.input('year', sql.Int, parseInt(year));
  }

  if (month) {
    conditions.push("MONTH(h.DocDate) = @month");
    request.input('month', sql.Int, parseInt(month));
  }

  if (product) {
    conditions.push("i.ItemCode = @product");
    request.input('product', sql.NVarChar, product);
  }

  if (productGroup) {
    conditions.push("m.ItmsGrpCod = @productGroup");
    request.input('productGroup', sql.Int, parseInt(productGroup));
  }

  if (warehouse) {
    conditions.push("i.WhsCode = @warehouse");
    request.input('warehouse', sql.NVarChar, warehouse);
  }

  if (order) {
    conditions.push("p.DocNum = @order");
    request.input('order', sql.Int, parseInt(order));
  }

  if (status) {
    conditions.push("p.Status = @status");
    request.input('status', sql.Char, status);
  }

  if (machine) {
    conditions.push(`EXISTS (
      SELECT 1 FROM LDS_LIVE.dbo.WOR1 w 
      INNER JOIN LDS_LIVE.dbo.ORSC r ON w.ItemCode = r.ResCode 
      WHERE w.DocEntry = p.DocEntry AND w.ItemType = 290 AND r.ResCode = @machine
    )`);
    request.input('machine', sql.NVarChar, machine);
  }

  return "WHERE " + conditions.join(" AND ");
}

exports.getSummary = async (req, res) => {
  try {
    const pool = await poolPromise;
    const request = pool.request();
    const whereClause = buildWhereClause(req.query, request);
    const orderWhereClause = buildOrderWhereClause(req.query, request);

    // 1. Query for Production Metrics (Requires a valid receipt IGN1)
    const prodQuery = `
      SELECT 
        ISNULL(SUM(i.Quantity), 0) AS TotalProductionQty
      FROM LDS_LIVE.dbo.IGN1 i
      INNER JOIN LDS_LIVE.dbo.OIGN h ON i.DocEntry = h.DocEntry
      INNER JOIN LDS_LIVE.dbo.OWOR p ON i.BaseEntry = p.DocEntry
      LEFT JOIN LDS_LIVE.dbo.OITM m ON i.ItemCode = m.ItemCode
      ${whereClause}
    `;

    // 2. Query for Order Metrics (Queries all production orders regardless of receipts)
    const orderQuery = `
      SELECT 
        COUNT(DISTINCT p.DocEntry) AS TotalOrders,
        COUNT(DISTINCT CASE WHEN p.Status IN ('R', 'P') THEN p.DocEntry END) AS PendingOrders,
        COUNT(DISTINCT CASE WHEN p.Status = 'L' THEN p.DocEntry END) AS CompleteOrders,
        COUNT(DISTINCT CASE WHEN p.Status = 'C' THEN p.DocEntry END) AS CancelledOrders
      FROM LDS_LIVE.dbo.OWOR p
      LEFT JOIN LDS_LIVE.dbo.OITM m ON p.ItemCode = m.ItemCode
      ${orderWhereClause}
    `;

    const [prodResult, orderResult] = await Promise.all([
      request.query(prodQuery),
      request.query(orderQuery)
    ]);

    const prodSummary = prodResult.recordset[0] || { TotalProductionQty: 0 };
    const orderSummary = orderResult.recordset[0] || { TotalOrders: 0, PendingOrders: 0, CompleteOrders: 0, CancelledOrders: 0 };

    // Calculate Growth % (Current Period vs Previous Period)
    let growthPercent = 0;
    const selectedYear = parseInt(req.query.year) || (req.query.dateFrom ? new Date(req.query.dateFrom).getFullYear() : null);

    if (selectedYear) {
      const prevReq = pool.request();
      const prevQueryFilters = { ...req.query, year: selectedYear - 1 };
      
      if (prevQueryFilters.dateFrom) {
        const prevDateFrom = new Date(prevQueryFilters.dateFrom);
        prevDateFrom.setFullYear(prevDateFrom.getFullYear() - 1);
        prevQueryFilters.dateFrom = prevDateFrom.toISOString().split('T')[0];
      }
      if (prevQueryFilters.dateTo) {
        const prevDateTo = new Date(prevQueryFilters.dateTo);
        prevDateTo.setFullYear(prevDateTo.getFullYear() - 1);
        prevQueryFilters.dateTo = prevDateTo.toISOString().split('T')[0];
      }
      
      const prevWhereClause = buildWhereClause(prevQueryFilters, prevReq);
      const prevQuery = `
        SELECT ISNULL(SUM(i.Quantity), 0) AS PrevProductionQty
        FROM LDS_LIVE.dbo.IGN1 i
        INNER JOIN LDS_LIVE.dbo.OIGN h ON i.DocEntry = h.DocEntry
        INNER JOIN LDS_LIVE.dbo.OWOR p ON i.BaseEntry = p.DocEntry
        LEFT JOIN LDS_LIVE.dbo.OITM m ON i.ItemCode = m.ItemCode
        ${prevWhereClause}
      `;
      const prevRes = await prevReq.query(prevQuery);
      const prevQty = prevRes.recordset[0]?.PrevProductionQty || 0;

      if (prevQty > 0) {
        growthPercent = ((summary.TotalProductionQty - prevQty) / prevQty) * 100;
      } else if (summary.TotalProductionQty > 0) {
        growthPercent = 100;
      }
    }

    res.status(200).json({
      success: true,
      data: {
        totalOrders: orderSummary.TotalOrders,
        pendingOrders: orderSummary.PendingOrders,
        completeOrders: orderSummary.CompleteOrders,
        cancelledOrders: orderSummary.CancelledOrders,
        totalProduction: parseFloat(prodSummary.TotalProductionQty).toFixed(2)
      }
    });
  } catch (error) {
    console.error('Error fetching production summary:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch production summary' });
  }
};

exports.getMonthlyTrend = async (req, res) => {
  try {
    const pool = await poolPromise;
    const request = pool.request();
    const whereClause = buildWhereClause(req.query, request);

    const query = `
      SELECT 
        MONTH(h.DocDate) AS MonthNum,
        DATENAME(month, h.DocDate) AS MonthName,
        ISNULL(SUM(i.Quantity), 0) AS TotalQty
      FROM LDS_LIVE.dbo.IGN1 i
      INNER JOIN LDS_LIVE.dbo.OIGN h ON i.DocEntry = h.DocEntry
      INNER JOIN LDS_LIVE.dbo.OWOR p ON i.BaseEntry = p.DocEntry
      LEFT JOIN LDS_LIVE.dbo.OITM m ON i.ItemCode = m.ItemCode
      ${whereClause}
      GROUP BY MONTH(h.DocDate), DATENAME(month, h.DocDate)
      ORDER BY MonthNum ASC
    `;

    const result = await request.query(query);

    // Ensure all 12 months are represented
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthlyMap = {};
    monthNames.forEach((m, idx) => { monthlyMap[idx + 1] = 0; });

    result.recordset.forEach(row => {
      monthlyMap[row.MonthNum] = parseFloat(row.TotalQty);
    });

    const monthlyData = monthNames.map((name, idx) => ({
      month: name,
      monthNum: idx + 1,
      totalQty: monthlyMap[idx + 1]
    }));

    res.status(200).json({ success: true, data: monthlyData });
  } catch (error) {
    console.error('Error fetching monthly trend:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch monthly trend' });
  }
};

exports.getYearlyTrend = async (req, res) => {
  try {
    const pool = await poolPromise;
    const request = pool.request();
    const whereClause = buildWhereClause(req.query, request);

    const query = `
      SELECT 
        YEAR(h.DocDate) AS YearNum,
        ISNULL(SUM(i.Quantity), 0) AS TotalQty
      FROM LDS_LIVE.dbo.IGN1 i
      INNER JOIN LDS_LIVE.dbo.OIGN h ON i.DocEntry = h.DocEntry
      INNER JOIN LDS_LIVE.dbo.OWOR p ON i.BaseEntry = p.DocEntry
      LEFT JOIN LDS_LIVE.dbo.OITM m ON i.ItemCode = m.ItemCode
      ${whereClause}
      GROUP BY YEAR(h.DocDate)
      ORDER BY YearNum ASC
    `;

    const result = await request.query(query);
    const yearlyData = result.recordset.map(row => ({
      year: row.YearNum,
      totalQty: parseFloat(row.TotalQty)
    }));

    res.status(200).json({ success: true, data: yearlyData });
  } catch (error) {
    console.error('Error fetching yearly trend:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch yearly trend' });
  }
};

exports.getProductShare = async (req, res) => {
  try {
    const pool = await poolPromise;
    const request = pool.request();
    const whereClause = buildWhereClause(req.query, request);

    const query = `
      SELECT TOP 10
        i.ItemCode AS ProductCode,
        ISNULL(m.ItemName, i.ItemCode) AS ProductName,
        ISNULL(SUM(i.Quantity), 0) AS TotalQty
      FROM LDS_LIVE.dbo.IGN1 i
      INNER JOIN LDS_LIVE.dbo.OIGN h ON i.DocEntry = h.DocEntry
      INNER JOIN LDS_LIVE.dbo.OWOR p ON i.BaseEntry = p.DocEntry
      LEFT JOIN LDS_LIVE.dbo.OITM m ON i.ItemCode = m.ItemCode
      ${whereClause}
      GROUP BY i.ItemCode, m.ItemName
      ORDER BY TotalQty DESC
    `;

    const result = await request.query(query);
    const totalAll = result.recordset.reduce((sum, row) => sum + parseFloat(row.TotalQty), 0);

    const productShare = result.recordset.map(row => {
      const qty = parseFloat(row.TotalQty);
      const percentage = totalAll > 0 ? (qty / totalAll) * 100 : 0;
      return {
        productCode: row.ProductCode,
        productName: row.ProductName,
        totalQty: qty,
        percentage: parseFloat(percentage.toFixed(2))
      };
    });

    res.status(200).json({ success: true, data: productShare, totalQty: totalAll });
  } catch (error) {
    console.error('Error fetching product share:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch product share' });
  }
};

exports.getYearComparison = async (req, res) => {
  try {
    const pool = await poolPromise;
    
    // Determine current year and previous year
    let currentYear = parseInt(req.query.year);
    if (!currentYear && req.query.dateFrom) {
      currentYear = new Date(req.query.dateFrom).getFullYear();
    } else if (!currentYear && req.query.dateTo) {
      currentYear = new Date(req.query.dateTo).getFullYear();
    }
    
    if (!currentYear) {
      const maxYearRes = await pool.request().query(`SELECT MAX(YEAR(DocDate)) AS MaxYear FROM LDS_LIVE.dbo.OIGN`);
      currentYear = maxYearRes.recordset[0]?.MaxYear || new Date().getFullYear();
    }
    const previousYear = currentYear - 1;

    // Fetch current year monthly data
    const curReq = pool.request();
    const curFilters = { ...req.query, year: currentYear };
    delete curFilters.dateFrom;
    delete curFilters.dateTo;
    const curWhere = buildWhereClause(curFilters, curReq);
    const curQuery = `
      SELECT MONTH(h.DocDate) AS MonthNum, ISNULL(SUM(i.Quantity), 0) AS TotalQty
      FROM LDS_LIVE.dbo.IGN1 i
      INNER JOIN LDS_LIVE.dbo.OIGN h ON i.DocEntry = h.DocEntry
      INNER JOIN LDS_LIVE.dbo.OWOR p ON i.BaseEntry = p.DocEntry
      LEFT JOIN LDS_LIVE.dbo.OITM m ON i.ItemCode = m.ItemCode
      ${curWhere}
      GROUP BY MONTH(h.DocDate)
    `;

    // Fetch previous year monthly data
    const prevReq = pool.request();
    const prevFilters = { ...req.query, year: previousYear };
    delete prevFilters.dateFrom;
    delete prevFilters.dateTo;
    const prevWhere = buildWhereClause(prevFilters, prevReq);
    const prevQuery = `
      SELECT MONTH(h.DocDate) AS MonthNum, ISNULL(SUM(i.Quantity), 0) AS TotalQty
      FROM LDS_LIVE.dbo.IGN1 i
      INNER JOIN LDS_LIVE.dbo.OIGN h ON i.DocEntry = h.DocEntry
      INNER JOIN LDS_LIVE.dbo.OWOR p ON i.BaseEntry = p.DocEntry
      LEFT JOIN LDS_LIVE.dbo.OITM m ON i.ItemCode = m.ItemCode
      ${prevWhere}
      GROUP BY MONTH(h.DocDate)
    `;

    const [curRes, prevRes] = await Promise.all([curReq.query(curQuery), prevReq.query(prevQuery)]);

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const curMap = {}, prevMap = {};
    monthNames.forEach((_, idx) => { curMap[idx + 1] = 0; prevMap[idx + 1] = 0; });

    curRes.recordset.forEach(r => { curMap[r.MonthNum] = parseFloat(r.TotalQty); });
    prevRes.recordset.forEach(r => { prevMap[r.MonthNum] = parseFloat(r.TotalQty); });

    const comparisonData = monthNames.map((name, idx) => ({
      month: name,
      currentYearQty: curMap[idx + 1],
      previousYearQty: prevMap[idx + 1],
      currentYearLabel: currentYear.toString(),
      previousYearLabel: previousYear.toString()
    }));

    res.status(200).json({
      success: true,
      data: comparisonData,
      currentYear,
      previousYear
    });
  } catch (error) {
    console.error('Error fetching year comparison:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch year comparison' });
  }
};

exports.getTableData = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.limit) || parseInt(req.query.pageSize) || 10;
    const search = req.query.search || '';
    const offset = (page - 1) * pageSize;

    const pool = await poolPromise;
    const request = pool.request();
    let whereClause = buildWhereClause(req.query, request);

    if (search) {
      whereClause += ` AND (i.ItemCode LIKE @search OR m.ItemName LIKE @search OR p.DocNum LIKE @search OR g.ItmsGrpNam LIKE @search)`;
      request.input('search', sql.NVarChar, `%${search}%`);
    }

    // Count query
    const countQuery = `
      SELECT COUNT(*) AS totalRecords
      FROM LDS_LIVE.dbo.IGN1 i
      INNER JOIN LDS_LIVE.dbo.OIGN h ON i.DocEntry = h.DocEntry
      INNER JOIN LDS_LIVE.dbo.OWOR p ON i.BaseEntry = p.DocEntry
      LEFT JOIN LDS_LIVE.dbo.OITM m ON i.ItemCode = m.ItemCode
      LEFT JOIN LDS_LIVE.dbo.OITB g ON m.ItmsGrpCod = g.ItmsGrpCod
      ${whereClause}
    `;

    // Data query with SQL Server OFFSET...FETCH NEXT
    const dataQuery = `
      SELECT 
        h.DocDate AS ReceiptDate,
        p.DocNum AS OrderNum,
        p.Status AS OrderStatus,
        i.ItemCode AS ProductCode,
        ISNULL(m.ItemName, i.ItemCode) AS ProductDescription,
        ISNULL(g.ItmsGrpNam, 'N/A') AS ProductGroup,
        i.WhsCode AS Warehouse,
        ISNULL(SUM(i.Quantity), 0) AS ProductionQty,
        ISNULL(MAX(p.RjctQty), 0) AS RejectedQty
      FROM LDS_LIVE.dbo.IGN1 i
      INNER JOIN LDS_LIVE.dbo.OIGN h ON i.DocEntry = h.DocEntry
      INNER JOIN LDS_LIVE.dbo.OWOR p ON i.BaseEntry = p.DocEntry
      LEFT JOIN LDS_LIVE.dbo.OITM m ON i.ItemCode = m.ItemCode
      LEFT JOIN LDS_LIVE.dbo.OITB g ON m.ItmsGrpCod = g.ItmsGrpCod
      ${whereClause}
      GROUP BY h.DocDate, p.DocNum, p.Status, i.ItemCode, m.ItemName, g.ItmsGrpNam, i.WhsCode
      ORDER BY h.DocDate DESC, p.DocNum DESC
      OFFSET ${offset} ROWS
      FETCH NEXT ${pageSize} ROWS ONLY
    `;

    const [countRes, dataRes] = await Promise.all([request.query(countQuery), request.query(dataQuery)]);

    const totalRecords = countRes.recordset[0]?.totalRecords || 0;
    const totalPages = Math.ceil(totalRecords / pageSize);

    const formattedData = dataRes.recordset.map(row => {
      let statusStr = row.OrderStatus;
      if (row.OrderStatus === 'R') statusStr = 'Released';
      if (row.OrderStatus === 'L') statusStr = 'Closed';
      if (row.OrderStatus === 'P') statusStr = 'Planned';
      if (row.OrderStatus === 'C') statusStr = 'Canceled';

      return {
        receiptDate: row.ReceiptDate,
        orderNum: row.OrderNum,
        orderStatus: statusStr,
        productCode: row.ProductCode,
        productDescription: row.ProductDescription,
        productGroup: row.ProductGroup,
        warehouse: row.Warehouse,
        productionQty: parseFloat(row.ProductionQty).toFixed(2),
        rejectedQty: parseFloat(row.RejectedQty).toFixed(2)
      };
    });

    res.status(200).json({
      success: true,
      data: formattedData,
      pagination: {
        page,
        pageSize,
        totalItems: totalRecords,
        totalPages
      }
    });
  } catch (error) {
    console.error('Error fetching production trend table:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch production trend table' });
  }
};

exports.getFilterOptions = async (req, res) => {
  try {
    const pool = await poolPromise;

    const yearsQuery = `
      SELECT DISTINCT YEAR(DocDate) AS value 
      FROM LDS_LIVE.dbo.OIGN 
      WHERE CANCELED = 'N'
      ORDER BY value DESC
    `;

    const productsQuery = `
      SELECT DISTINCT i.ItemCode AS value, ISNULL(m.ItemName, i.ItemCode) AS label
      FROM LDS_LIVE.dbo.IGN1 i
      LEFT JOIN LDS_LIVE.dbo.OITM m ON i.ItemCode = m.ItemCode
      WHERE i.BaseType = 202
      ORDER BY label ASC
    `;

    const groupsQuery = `
      SELECT DISTINCT g.ItmsGrpCod AS value, g.ItmsGrpNam AS label
      FROM LDS_LIVE.dbo.OITB g
      ORDER BY label ASC
    `;

    const warehousesQuery = `
      SELECT WhsCode AS value, WhsName AS label 
      FROM LDS_LIVE.dbo.OWHS 
      ORDER BY label ASC
    `;

    const machinesQuery = `
      SELECT ResCode AS value, ResName AS label 
      FROM LDS_LIVE.dbo.ORSC 
      WHERE ResType = 'O' 
      ORDER BY label ASC
    `;

    const [yearsRes, productsRes, groupsRes, warehousesRes, machinesRes] = await Promise.all([
      pool.request().query(yearsQuery),
      pool.request().query(productsQuery),
      pool.request().query(groupsQuery),
      pool.request().query(warehousesQuery),
      pool.request().query(machinesQuery)
    ]);

    res.status(200).json({
      success: true,
      data: {
        years: yearsRes.recordset.map(r => ({ value: r.value, label: r.value.toString() })),
        months: [
          { value: 1, label: 'January' },
          { value: 2, label: 'February' },
          { value: 3, label: 'March' },
          { value: 4, label: 'April' },
          { value: 5, label: 'May' },
          { value: 6, label: 'June' },
          { value: 7, label: 'July' },
          { value: 8, label: 'August' },
          { value: 9, label: 'September' },
          { value: 10, label: 'October' },
          { value: 11, label: 'November' },
          { value: 12, label: 'December' }
        ],
        products: productsRes.recordset,
        productGroups: groupsRes.recordset,
        warehouses: warehousesRes.recordset,
        machines: machinesRes.recordset,
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
    res.status(500).json({ success: false, message: 'Failed to fetch filter options' });
  }
};
