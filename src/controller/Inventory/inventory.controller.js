const { poolPromise } = require("../../database/connection");
const { getSapDocumentType } = require("../../utils/sapDocTypes");

// ─── Allowed sort columns (whitelist to prevent SQL injection) ──────────────
const ALLOWED_SORT_COLUMNS = {
  ItemCode: "iw.ItemCode",
  ItemName: "m.ItemName",
  WhsCode: "iw.WhsCode",
  OnHand: "iw.OnHand",
  IsCommited: "iw.IsCommited",
  OnOrder: "iw.OnOrder",
  AvgPrice: "m.AvgPrice",
  ItmsGrpNam: "g.ItmsGrpNam",
};

// ─── Helper: safe integer parsing ───────────────────────────────────────────
function safeInt(val, fallback) {
  const n = parseInt(val, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// ─── Helper: safe float ─────────────────────────────────────────────────────
function safeNum(val) {
  const n = parseFloat(val);
  return Number.isFinite(n) ? n : 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/inventory/summary
// Executive KPI cards
// ═══════════════════════════════════════════════════════════════════════════════
async function getSummary(req, res) {
  try {
    const pool = await poolPromise;
    const warehouse = req.query.warehouse || null;
    const itemGroup = req.query.itemGroup || null;
    const category = req.query.category || null;

    let warehouseFilter = "";
    let itemGroupFilter = "";
    let categoryFilter = "";

    if (warehouse) warehouseFilter = "AND iw.WhsCode = @warehouse";
    if (itemGroup) itemGroupFilter = "AND m.ItmsGrpCod = @itemGroup";
    if (category) categoryFilter = "AND m.U_cat1 = @category";

    const query = `
      ;WITH Stock AS (
        SELECT
          iw.ItemCode,
          iw.WhsCode,
          iw.OnHand,
          iw.IsCommited,
          iw.OnOrder,
          iw.MinStock,
          iw.MaxStock,
          m.ItmsGrpCod,
          m.U_cat1
        FROM LDS_LIVE.dbo.OITW iw
        INNER JOIN LDS_LIVE.dbo.OITM m ON iw.ItemCode = m.ItemCode
        WHERE 1=1
          ${warehouseFilter}
          ${itemGroupFilter}
          ${categoryFilter}
      )
      SELECT
        COUNT(DISTINCT CASE WHEN s.OnHand <> 0 THEN s.ItemCode END) AS ActiveSKUs,
        COUNT(DISTINCT CASE WHEN s.OnHand <> 0 THEN s.WhsCode END) AS ActiveWarehouses,
        ISNULL(SUM(s.OnHand), 0) AS TotalOnHand,
        ISNULL(SUM(s.IsCommited), 0) AS TotalCommitted,
        ISNULL(SUM(s.OnOrder), 0) AS TotalOnOrder,
        ISNULL(SUM(s.OnHand - s.IsCommited), 0) AS TotalAvailable,
        COUNT(DISTINCT CASE WHEN s.OnHand <= 0 THEN s.ItemCode END) AS OutOfStockItems,
        COUNT(DISTINCT CASE WHEN s.OnHand < 0 THEN s.ItemCode END) AS NegativeStockItems,
        COUNT(DISTINCT CASE WHEN s.MinStock > 0 AND (s.OnHand - s.IsCommited) < s.MinStock THEN s.ItemCode END) AS CriticalItems,
        COUNT(DISTINCT CASE WHEN s.MaxStock > 0 AND s.OnHand > s.MaxStock THEN s.ItemCode END) AS ExcessItems
      FROM Stock s
    `;

    const categoryWiseQuery = `
      SELECT
        ISNULL(NULLIF(LTRIM(RTRIM(m.U_cat1)), ''), 'Uncategorized') AS Category,
        COUNT(DISTINCT iw.ItemCode) AS TotalSKUs,
        ISNULL(SUM(iw.OnHand), 0) AS OnHand,
        ISNULL(SUM(CASE WHEN (iw.OnHand + iw.OnOrder - iw.IsCommited) < 0 THEN 0 ELSE (iw.OnHand + iw.OnOrder - iw.IsCommited) END), 0) AS Available,
        ISNULL(SUM(iw.IsCommited), 0) AS Committed,
        ISNULL(SUM(iw.OnOrder), 0) AS OnOrder,
        COUNT(DISTINCT CASE WHEN iw.MinStock > 0 AND (iw.OnHand - iw.IsCommited) < iw.MinStock THEN iw.ItemCode END) AS CriticalItems,
        COUNT(DISTINCT CASE WHEN (iw.OnHand + iw.OnOrder - iw.IsCommited) < iw.IsCommited THEN iw.ItemCode END) AS OutOfStockItems,
        COUNT(DISTINCT CASE WHEN iw.OnHand < 0 THEN iw.ItemCode END) AS NegativeStockItems,
        COUNT(DISTINCT CASE WHEN (iw.OnHand + iw.OnOrder - iw.IsCommited) > iw.IsCommited AND iw.IsCommited > 0 THEN iw.ItemCode END) AS ExcessStockItems
      FROM LDS_LIVE.dbo.OITW iw
      INNER JOIN LDS_LIVE.dbo.OITM m ON iw.ItemCode = m.ItemCode
      WHERE 1=1
        ${warehouseFilter}
        ${itemGroupFilter}
        ${categoryFilter}
      GROUP BY ISNULL(NULLIF(LTRIM(RTRIM(m.U_cat1)), ''), 'Uncategorized')
      ORDER BY OnHand DESC
    `;

    const request = pool.request();
    if (warehouse) request.input("warehouse", warehouse);
    if (itemGroup) request.input("itemGroup", parseInt(itemGroup));
    if (category) request.input("category", category);

    const [result, categoryWiseResult] = await Promise.all([
      request.query(query),
      request.query(categoryWiseQuery)
    ]);
    const summary = result.recordset[0];

    // Batch expiry query (separate grain)
    const expiryQuery = `
      SELECT
        COUNT(DISTINCT CASE WHEN b.ExpDate IS NOT NULL AND b.ExpDate < GETDATE() THEN CONCAT(b.ItemCode, '-', b.DistNumber) END) AS ExpiredBatches,
        COUNT(DISTINCT CASE WHEN b.ExpDate IS NOT NULL AND b.ExpDate >= GETDATE() AND b.ExpDate <= DATEADD(DAY, 90, GETDATE()) THEN CONCAT(b.ItemCode, '-', b.DistNumber) END) AS NearExpiryBatches
      FROM LDS_LIVE.dbo.OBTN b
      INNER JOIN LDS_LIVE.dbo.OBTQ q ON b.ItemCode = q.ItemCode AND b.SysNumber = q.SysNumber
      WHERE q.Quantity > 0
    `;
    const expiryResult = await pool.request().query(expiryQuery);
    const expiry = expiryResult.recordset[0];

    return res.json({
      success: true,
      data: {
        activeSKUs: summary.ActiveSKUs || 0,
        activeWarehouses: summary.ActiveWarehouses || 0,
        totalOnHand: safeNum(summary.TotalOnHand),
        totalCommitted: safeNum(summary.TotalCommitted),
        totalOnOrder: safeNum(summary.TotalOnOrder),
        totalAvailable: safeNum(summary.TotalAvailable),
        outOfStockItems: summary.OutOfStockItems || 0,
        negativeStockItems: summary.NegativeStockItems || 0,
        criticalItems: summary.CriticalItems || 0,
        excessItems: summary.ExcessItems || 0,
        expiredBatches: expiry.ExpiredBatches || 0,
        nearExpiryBatches: expiry.NearExpiryBatches || 0,
        categoryWise: categoryWiseResult.recordset,
      },
    });
  } catch (error) {
    console.error("Inventory summary error:", error);
    return res.status(500).json({ success: false, message: "Unable to retrieve inventory summary" });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/inventory/current
// Paginated, searchable, filterable inventory table
// ═══════════════════════════════════════════════════════════════════════════════
async function getCurrentStock(req, res) {
  try {
    const pool = await poolPromise;
    const page = safeInt(req.query.page, 1);
    const pageSize = Math.min(safeInt(req.query.pageSize, 50), 200);
    const search = req.query.search || "";
    const warehouse = req.query.warehouse || null;
    const itemGroup = req.query.itemGroup || null;
    const category = req.query.category || null;
    const status = req.query.status || null;
    const sortBy = req.query.sortBy || "ItemCode";
    const sortOrder = (req.query.sortOrder || "").toUpperCase() === "DESC" ? "DESC" : "ASC";

    const sortColumn = ALLOWED_SORT_COLUMNS[sortBy] || "iw.ItemCode";

    let filters = "";
    if (warehouse) filters += " AND iw.WhsCode = @warehouse";
    if (itemGroup) filters += " AND m.ItmsGrpCod = @itemGroup";
    if (category) filters += " AND m.U_cat1 = @category";
    if (search) filters += " AND (iw.ItemCode LIKE @search OR m.ItemName LIKE @search)";

    // Status filter
    if (status === "out") filters += " AND (iw.OnHand + iw.OnOrder - iw.IsCommited) < iw.IsCommited";
    else if (status === "excess") filters += " AND (iw.OnHand + iw.OnOrder - iw.IsCommited) > iw.IsCommited AND iw.IsCommited > 0";
    else if (status === "normal") filters += " AND NOT ((iw.OnHand + iw.OnOrder - iw.IsCommited) < iw.IsCommited OR ((iw.OnHand + iw.OnOrder - iw.IsCommited) > iw.IsCommited AND iw.IsCommited > 0))";

    const offset = (page - 1) * pageSize;

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM LDS_LIVE.dbo.OITW iw
      INNER JOIN LDS_LIVE.dbo.OITM m ON iw.ItemCode = m.ItemCode
      LEFT JOIN LDS_LIVE.dbo.OITB g ON m.ItmsGrpCod = g.ItmsGrpCod
      WHERE (iw.OnHand <> 0 OR iw.IsCommited <> 0 OR iw.OnOrder <> 0)
        ${filters}
    `;

    const dataQuery = `
      SELECT
        iw.ItemCode,
        m.ItemName,
        g.ItmsGrpNam AS ItemGroup,
        m.U_cat1 AS Category,
        m.U_Division AS Division,
        iw.WhsCode,
        w.WhsName,
        iw.OnHand,
        iw.IsCommited AS Committed,
        iw.OnOrder,
        CASE WHEN (iw.OnHand + iw.OnOrder - iw.IsCommited) < 0 THEN 0 ELSE (iw.OnHand + iw.OnOrder - iw.IsCommited) END AS Available,
        CASE WHEN (iw.OnHand + iw.OnOrder - iw.IsCommited) < 0 THEN ABS(iw.OnHand + iw.OnOrder - iw.IsCommited) ELSE 0 END AS OutOfOrder,
        iw.MinStock,
        iw.MaxStock,
        m.InvntryUom AS UOM,
        CASE
          WHEN (iw.OnHand + iw.OnOrder - iw.IsCommited) < iw.IsCommited THEN 'Out of Stock'
          WHEN (iw.OnHand + iw.OnOrder - iw.IsCommited) > iw.IsCommited AND iw.IsCommited > 0 THEN 'Excess'
          ELSE 'Normal'
        END AS StockStatus
      FROM LDS_LIVE.dbo.OITW iw
      INNER JOIN LDS_LIVE.dbo.OITM m ON iw.ItemCode = m.ItemCode
      LEFT JOIN LDS_LIVE.dbo.OITB g ON m.ItmsGrpCod = g.ItmsGrpCod
      LEFT JOIN LDS_LIVE.dbo.OWHS w ON iw.WhsCode = w.WhsCode
      WHERE (iw.OnHand <> 0 OR iw.IsCommited <> 0 OR iw.OnOrder <> 0)
        ${filters}
      ORDER BY ${sortColumn} ${sortOrder}
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `;

    const request = pool.request();
    request.input("offset", offset);
    request.input("pageSize", pageSize);
    if (warehouse) request.input("warehouse", warehouse);
    if (itemGroup) request.input("itemGroup", parseInt(itemGroup));
    if (category) request.input("category", category);
    if (search) request.input("search", `%${search}%`);

    const [countResult, dataResult] = await Promise.all([
      request.query(countQuery),
      request.query(dataQuery),
    ]);

    const totalRecords = countResult.recordset[0].total;

    return res.json({
      success: true,
      data: dataResult.recordset,
      pagination: {
        page,
        pageSize,
        totalRecords,
        totalPages: Math.ceil(totalRecords / pageSize),
      },
    });
  } catch (error) {
    console.error("Current stock error:", error);
    return res.status(500).json({ success: false, message: "Unable to retrieve current stock data" });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/inventory/warehouses
// Warehouse-level inventory summary
// ═══════════════════════════════════════════════════════════════════════════════
async function getWarehouseSummary(req, res) {
  try {
    const pool = await poolPromise;
    const query = `
      SELECT
        iw.WhsCode,
        w.WhsName,
        COUNT(DISTINCT iw.ItemCode) AS TotalSKUs,
        ISNULL(SUM(iw.OnHand), 0) AS TotalOnHand,
        ISNULL(SUM(iw.IsCommited), 0) AS TotalCommitted,
        ISNULL(SUM(iw.OnOrder), 0) AS TotalOnOrder,
        ISNULL(SUM(CASE WHEN (iw.OnHand + iw.OnOrder - iw.IsCommited) < 0 THEN 0 ELSE (iw.OnHand + iw.OnOrder - iw.IsCommited) END), 0) AS TotalAvailable,
        SUM(CASE WHEN iw.OnHand <= 0 THEN 1 ELSE 0 END) AS OutOfStockItems,
        SUM(CASE WHEN iw.MinStock > 0 AND (iw.OnHand - iw.IsCommited) < iw.MinStock THEN 1 ELSE 0 END) AS CriticalItems
      FROM LDS_LIVE.dbo.OITW iw
      INNER JOIN LDS_LIVE.dbo.OITM m ON iw.ItemCode = m.ItemCode
      LEFT JOIN LDS_LIVE.dbo.OWHS w ON iw.WhsCode = w.WhsCode
      WHERE iw.OnHand <> 0 OR iw.IsCommited <> 0 OR iw.OnOrder <> 0
      GROUP BY iw.WhsCode, w.WhsName
      ORDER BY TotalOnHand DESC
    `;
    const result = await pool.request().query(query);
    return res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error("Warehouse summary error:", error);
    return res.status(500).json({ success: false, message: "Unable to retrieve warehouse summary" });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/inventory/item-groups
// Item Group / Category breakdown
// ═══════════════════════════════════════════════════════════════════════════════
async function getItemGroupSummary(req, res) {
  try {
    const pool = await poolPromise;
    const query = `
      SELECT
        g.ItmsGrpNam AS ItemGroup,
        COUNT(DISTINCT iw.ItemCode) AS TotalSKUs,
        ISNULL(SUM(iw.OnHand), 0) AS TotalOnHand,
        ISNULL(SUM(iw.IsCommited), 0) AS TotalCommitted,
        ISNULL(SUM(iw.OnHand - iw.IsCommited), 0) AS TotalAvailable
      FROM LDS_LIVE.dbo.OITW iw
      INNER JOIN LDS_LIVE.dbo.OITM m ON iw.ItemCode = m.ItemCode
      LEFT JOIN LDS_LIVE.dbo.OITB g ON m.ItmsGrpCod = g.ItmsGrpCod
      WHERE iw.OnHand <> 0 OR iw.IsCommited <> 0
      GROUP BY g.ItmsGrpNam
      ORDER BY TotalOnHand DESC
    `;
    const result = await pool.request().query(query);
    return res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error("Item group summary error:", error);
    return res.status(500).json({ success: false, message: "Unable to retrieve item group summary" });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/inventory/movements
// Paginated inventory movement log from OINM
// ═══════════════════════════════════════════════════════════════════════════════
async function getMovements(req, res) {
  try {
    const pool = await poolPromise;
    const page = safeInt(req.query.page, 1);
    const pageSize = Math.min(safeInt(req.query.pageSize, 50), 200);
    const search = req.query.search || "";
    const warehouse = req.query.warehouse || null;
    const fromDate = req.query.fromDate || null;
    const toDate = req.query.toDate || null;
    const transType = req.query.transType || null;

    let filters = "";
    if (warehouse) filters += " AND n.Warehouse = @warehouse";
    if (search) filters += " AND (n.ItemCode LIKE @search)";
    if (fromDate) filters += " AND n.DocDate >= @fromDate";
    if (toDate) filters += " AND n.DocDate <= @toDate";
    if (transType) filters += " AND n.TransType = @transType";

    const offset = (page - 1) * pageSize;

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM LDS_LIVE.dbo.OINM n
      WHERE 1=1 ${filters}
    `;

    const dataQuery = `
      SELECT
        n.DocDate,
        n.ItemCode,
        m.ItemName,
        n.Warehouse,
        w.WhsName,
        n.TransType,
        n.InQty,
        n.OutQty,
        n.BASE_REF AS DocNumber
      FROM LDS_LIVE.dbo.OINM n
      LEFT JOIN LDS_LIVE.dbo.OITM m ON n.ItemCode = m.ItemCode
      LEFT JOIN LDS_LIVE.dbo.OWHS w ON n.Warehouse = w.WhsCode
      WHERE 1=1 ${filters}
      ORDER BY n.DocDate DESC, n.CreatedBy DESC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `;

    const request = pool.request();
    request.input("offset", offset);
    request.input("pageSize", pageSize);
    if (warehouse) request.input("warehouse", warehouse);
    if (search) request.input("search", `%${search}%`);
    if (fromDate) request.input("fromDate", fromDate);
    if (toDate) request.input("toDate", toDate);
    if (transType) request.input("transType", parseInt(transType));

    const [countResult, dataResult] = await Promise.all([
      request.query(countQuery),
      request.query(dataQuery),
    ]);

    // Map TransType to human-readable names
    const mapped = dataResult.recordset.map((row) => ({
      ...row,
      TransTypeName: getSapDocumentType(row.TransType),
    }));

    return res.json({
      success: true,
      data: mapped,
      pagination: {
        page,
        pageSize,
        totalRecords: countResult.recordset[0].total,
        totalPages: Math.ceil(countResult.recordset[0].total / pageSize),
      },
    });
  } catch (error) {
    console.error("Movements error:", error);
    return res.status(500).json({ success: false, message: "Unable to retrieve inventory movements" });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/inventory/expiry
// Batch expiry analysis
// ═══════════════════════════════════════════════════════════════════════════════
async function getExpiry(req, res) {
  try {
    const pool = await poolPromise;

    // Bucketed summary
    const bucketQuery = `
      SELECT
        CASE
          WHEN b.ExpDate < GETDATE() THEN 'Expired'
          WHEN b.ExpDate <= DATEADD(DAY, 30, GETDATE()) THEN '0-30 Days'
          WHEN b.ExpDate <= DATEADD(DAY, 60, GETDATE()) THEN '31-60 Days'
          WHEN b.ExpDate <= DATEADD(DAY, 90, GETDATE()) THEN '61-90 Days'
          WHEN b.ExpDate <= DATEADD(DAY, 180, GETDATE()) THEN '91-180 Days'
          ELSE '180+ Days'
        END AS Bucket,
        COUNT(DISTINCT CONCAT(b.ItemCode, '-', b.DistNumber)) AS BatchCount,
        ISNULL(SUM(q.Quantity), 0) AS TotalQuantity
      FROM LDS_LIVE.dbo.OBTN b
      INNER JOIN LDS_LIVE.dbo.OBTQ q ON b.ItemCode = q.ItemCode AND b.SysNumber = q.SysNumber
      WHERE b.ExpDate IS NOT NULL AND q.Quantity > 0
      GROUP BY
        CASE
          WHEN b.ExpDate < GETDATE() THEN 'Expired'
          WHEN b.ExpDate <= DATEADD(DAY, 30, GETDATE()) THEN '0-30 Days'
          WHEN b.ExpDate <= DATEADD(DAY, 60, GETDATE()) THEN '31-60 Days'
          WHEN b.ExpDate <= DATEADD(DAY, 90, GETDATE()) THEN '61-90 Days'
          WHEN b.ExpDate <= DATEADD(DAY, 180, GETDATE()) THEN '91-180 Days'
          ELSE '180+ Days'
        END
    `;
    const result = await pool.request().query(bucketQuery);

    return res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error("Expiry error:", error);
    return res.status(500).json({ success: false, message: "Unable to retrieve expiry data" });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/inventory/batches
// Paginated batch list with QC status
// ═══════════════════════════════════════════════════════════════════════════════
async function getBatches(req, res) {
  try {
    const pool = await poolPromise;
    const page = safeInt(req.query.page, 1);
    const pageSize = Math.min(safeInt(req.query.pageSize, 50), 200);
    const search = req.query.search || "";
    const expiryStatus = req.query.expiryStatus || null;
    const expiryBucket = req.query.expiryBucket || null;

    let filters = "";
    if (search) filters += " AND (b.ItemCode LIKE @search OR b.DistNumber LIKE @search)";
    if (expiryStatus === "expired") filters += " AND b.ExpDate IS NOT NULL AND b.ExpDate < GETDATE()";
    else if (expiryStatus === "near") filters += " AND b.ExpDate IS NOT NULL AND b.ExpDate >= GETDATE() AND b.ExpDate <= DATEADD(DAY, 90, GETDATE())";

    if (expiryBucket) {
      if (expiryBucket === "Expired") filters += " AND b.ExpDate IS NOT NULL AND b.ExpDate < CAST(GETDATE() AS DATE)";
      else if (expiryBucket === "0-30 Days") filters += " AND b.ExpDate IS NOT NULL AND b.ExpDate >= CAST(GETDATE() AS DATE) AND b.ExpDate <= DATEADD(DAY, 30, CAST(GETDATE() AS DATE))";
      else if (expiryBucket === "31-60 Days") filters += " AND b.ExpDate IS NOT NULL AND b.ExpDate > DATEADD(DAY, 30, CAST(GETDATE() AS DATE)) AND b.ExpDate <= DATEADD(DAY, 60, CAST(GETDATE() AS DATE))";
      else if (expiryBucket === "61-90 Days") filters += " AND b.ExpDate IS NOT NULL AND b.ExpDate > DATEADD(DAY, 60, CAST(GETDATE() AS DATE)) AND b.ExpDate <= DATEADD(DAY, 90, CAST(GETDATE() AS DATE))";
      else if (expiryBucket === "91-180 Days") filters += " AND b.ExpDate IS NOT NULL AND b.ExpDate > DATEADD(DAY, 90, CAST(GETDATE() AS DATE)) AND b.ExpDate <= DATEADD(DAY, 180, CAST(GETDATE() AS DATE))";
      else if (expiryBucket === "180+ Days") filters += " AND b.ExpDate IS NOT NULL AND b.ExpDate > DATEADD(DAY, 180, CAST(GETDATE() AS DATE))";
    }

    const offset = (page - 1) * pageSize;

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM LDS_LIVE.dbo.OBTN b
      INNER JOIN LDS_LIVE.dbo.OBTQ q ON b.ItemCode = q.ItemCode AND b.SysNumber = q.SysNumber
      WHERE q.Quantity > 0 ${filters}
    `;

    const dataQuery = `
      SELECT
        b.ItemCode,
        m.ItemName,
        b.DistNumber AS BatchNumber,
        q.WhsCode,
        w.WhsName,
        q.Quantity,
        b.MnfDate,
        b.Indate AS AdmissionDate,
        b.ExpDate,
        CASE
          WHEN b.ExpDate IS NULL THEN NULL
          ELSE DATEDIFF(DAY, GETDATE(), b.ExpDate)
        END AS DaysUntilExpiry,
        b.U_QCDecision AS QCDecision,
        b.U_Status AS QCStatus
      FROM LDS_LIVE.dbo.OBTN b
      INNER JOIN LDS_LIVE.dbo.OBTQ q ON b.ItemCode = q.ItemCode AND b.SysNumber = q.SysNumber
      LEFT JOIN LDS_LIVE.dbo.OITM m ON b.ItemCode = m.ItemCode
      LEFT JOIN LDS_LIVE.dbo.OWHS w ON q.WhsCode = w.WhsCode
      WHERE q.Quantity > 0 ${filters}
      ORDER BY b.ExpDate ASC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `;

    const request = pool.request();
    request.input("offset", offset);
    request.input("pageSize", pageSize);
    if (search) request.input("search", `%${search}%`);

    const [countResult, dataResult] = await Promise.all([
      request.query(countQuery),
      request.query(dataQuery),
    ]);

    return res.json({
      success: true,
      data: dataResult.recordset,
      pagination: {
        page,
        pageSize,
        totalRecords: countResult.recordset[0].total,
        totalPages: Math.ceil(countResult.recordset[0].total / pageSize),
      },
    });
  } catch (error) {
    console.error("Batches error:", error);
    return res.status(500).json({ success: false, message: "Unable to retrieve batch data" });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/inventory/purchase-pipeline
// Open Purchase Orders (incoming stock pipeline)
// ═══════════════════════════════════════════════════════════════════════════════
async function getPurchasePipeline(req, res) {
  try {
    const pool = await poolPromise;
    const page = safeInt(req.query.page, 1);
    const pageSize = Math.min(safeInt(req.query.pageSize, 50), 200);
    const offset = (page - 1) * pageSize;

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM LDS_LIVE.dbo.OPOR h
      INNER JOIN LDS_LIVE.dbo.POR1 l ON h.DocEntry = l.DocEntry
      WHERE h.DocStatus = 'O' AND l.LineStatus = 'O'
    `;

    const dataQuery = `
      SELECT
        h.DocNum AS PONumber,
        h.CardName AS Supplier,
        l.ItemCode,
        m.ItemName,
        l.WhsCode,
        l.Quantity AS OrderedQty,
        (l.Quantity - l.OpenQty) AS ReceivedQty,
        l.OpenQty,
        l.ShipDate AS ExpectedDelivery,
        DATEDIFF(DAY, GETDATE(), l.ShipDate) AS DaysUntilDelivery
      FROM LDS_LIVE.dbo.OPOR h
      INNER JOIN LDS_LIVE.dbo.POR1 l ON h.DocEntry = l.DocEntry
      LEFT JOIN LDS_LIVE.dbo.OITM m ON l.ItemCode = m.ItemCode
      WHERE h.DocStatus = 'O' AND l.LineStatus = 'O'
      ORDER BY l.ShipDate ASC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `;

    const request = pool.request();
    request.input("offset", offset);
    request.input("pageSize", pageSize);

    const [countResult, dataResult] = await Promise.all([
      request.query(countQuery),
      request.query(dataQuery),
    ]);

    return res.json({
      success: true,
      data: dataResult.recordset,
      pagination: {
        page,
        pageSize,
        totalRecords: countResult.recordset[0].total,
        totalPages: Math.ceil(countResult.recordset[0].total / pageSize),
      },
    });
  } catch (error) {
    console.error("Purchase pipeline error:", error);
    return res.status(500).json({ success: false, message: "Unable to retrieve purchase pipeline" });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/inventory/commitments
// Open Sales Orders (committed stock detail)
// ═══════════════════════════════════════════════════════════════════════════════
async function getCommitments(req, res) {
  try {
    const pool = await poolPromise;
    const page = safeInt(req.query.page, 1);
    const pageSize = Math.min(safeInt(req.query.pageSize, 50), 200);
    const offset = (page - 1) * pageSize;

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM LDS_LIVE.dbo.ORDR h
      INNER JOIN LDS_LIVE.dbo.RDR1 l ON h.DocEntry = l.DocEntry
      WHERE h.DocStatus = 'O' AND l.LineStatus = 'O'
    `;

    const dataQuery = `
      SELECT
        h.DocNum AS SONumber,
        h.CardName AS Customer,
        l.ItemCode,
        m.ItemName,
        l.WhsCode,
        l.Quantity AS OrderedQty,
        (l.Quantity - l.OpenQty) AS DeliveredQty,
        l.OpenQty,
        l.ShipDate AS RequiredDate,
        DATEDIFF(DAY, GETDATE(), l.ShipDate) AS DaysUntilDue
      FROM LDS_LIVE.dbo.ORDR h
      INNER JOIN LDS_LIVE.dbo.RDR1 l ON h.DocEntry = l.DocEntry
      LEFT JOIN LDS_LIVE.dbo.OITM m ON l.ItemCode = m.ItemCode
      WHERE h.DocStatus = 'O' AND l.LineStatus = 'O'
      ORDER BY l.ShipDate ASC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `;

    const request = pool.request();
    request.input("offset", offset);
    request.input("pageSize", pageSize);

    const [countResult, dataResult] = await Promise.all([
      request.query(countQuery),
      request.query(dataQuery),
    ]);

    return res.json({
      success: true,
      data: dataResult.recordset,
      pagination: {
        page,
        pageSize,
        totalRecords: countResult.recordset[0].total,
        totalPages: Math.ceil(countResult.recordset[0].total / pageSize),
      },
    });
  } catch (error) {
    console.error("Commitments error:", error);
    return res.status(500).json({ success: false, message: "Unable to retrieve commitment data" });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/inventory/production-demand
// Raw material requirements from open production orders
// ═══════════════════════════════════════════════════════════════════════════════
async function getProductionDemand(req, res) {
  try {
    const pool = await poolPromise;
    const page = safeInt(req.query.page, 1);
    const pageSize = Math.min(safeInt(req.query.pageSize, 50), 200);
    const offset = (page - 1) * pageSize;

    const countQuery = `
      SELECT COUNT(DISTINCT c.ItemCode) AS total
      FROM LDS_LIVE.dbo.WOR1 c
      INNER JOIN LDS_LIVE.dbo.OWOR h ON c.DocEntry = h.DocEntry
      WHERE h.Status IN ('R', 'P')
        AND c.ItemType = 4
        AND c.PlannedQty > c.IssuedQty
    `;

    const dataQuery = `
      SELECT
        c.ItemCode,
        m.ItemName,
        SUM(c.PlannedQty) AS TotalPlanned,
        SUM(c.IssuedQty) AS TotalIssued,
        SUM(c.PlannedQty - c.IssuedQty) AS RemainingRequirement,
        ISNULL(
          (SELECT SUM(iw.OnHand - iw.IsCommited) FROM LDS_LIVE.dbo.OITW iw WHERE iw.ItemCode = c.ItemCode),
        0) AS AvailableStock,
        CASE
          WHEN ISNULL(
            (SELECT SUM(iw.OnHand - iw.IsCommited) FROM LDS_LIVE.dbo.OITW iw WHERE iw.ItemCode = c.ItemCode),
          0) < SUM(c.PlannedQty - c.IssuedQty)
          THEN SUM(c.PlannedQty - c.IssuedQty) - ISNULL(
            (SELECT SUM(iw.OnHand - iw.IsCommited) FROM LDS_LIVE.dbo.OITW iw WHERE iw.ItemCode = c.ItemCode),
          0)
          ELSE 0
        END AS ShortageQty
      FROM LDS_LIVE.dbo.WOR1 c
      INNER JOIN LDS_LIVE.dbo.OWOR h ON c.DocEntry = h.DocEntry
      LEFT JOIN LDS_LIVE.dbo.OITM m ON c.ItemCode = m.ItemCode
      WHERE h.Status IN ('R', 'P')
        AND c.ItemType = 4
        AND c.PlannedQty > c.IssuedQty
      GROUP BY c.ItemCode, m.ItemName
      ORDER BY ShortageQty DESC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `;

    const request = pool.request();
    request.input("offset", offset);
    request.input("pageSize", pageSize);

    const [countResult, dataResult] = await Promise.all([
      request.query(countQuery),
      request.query(dataQuery),
    ]);

    return res.json({
      success: true,
      data: dataResult.recordset,
      pagination: {
        page,
        pageSize,
        totalRecords: countResult.recordset[0].total,
        totalPages: Math.ceil(countResult.recordset[0].total / pageSize),
      },
    });
  } catch (error) {
    console.error("Production demand error:", error);
    return res.status(500).json({ success: false, message: "Unable to retrieve production demand" });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/inventory/items/:itemCode
// Detailed item drill-down
// ═══════════════════════════════════════════════════════════════════════════════
async function getItemDetail(req, res) {
  try {
    const pool = await poolPromise;
    const itemCode = req.params.itemCode;

    if (!itemCode) {
      return res.status(400).json({ success: false, message: "Item code is required" });
    }

    const request = pool.request().input("itemCode", itemCode);

    // Overview
    const overviewQuery = `
      SELECT
        m.ItemCode, m.ItemName, m.ItmsGrpCod,
        g.ItmsGrpNam AS ItemGroup,
        m.U_cat1 AS Category, m.U_Division AS Division,
        m.InvntryUom AS UOM, m.OnHand, m.IsCommited AS Committed, m.OnOrder,
        (m.OnHand - m.IsCommited) AS Available,
        (m.OnHand + m.OnOrder - m.IsCommited) AS Projected
      FROM LDS_LIVE.dbo.OITM m
      LEFT JOIN LDS_LIVE.dbo.OITB g ON m.ItmsGrpCod = g.ItmsGrpCod
      WHERE m.ItemCode = @itemCode
    `;

    // Warehouse breakdown
    const warehouseQuery = `
      SELECT
        iw.WhsCode, w.WhsName,
        iw.OnHand, iw.IsCommited AS Committed, iw.OnOrder,
        (iw.OnHand - iw.IsCommited) AS Available
      FROM LDS_LIVE.dbo.OITW iw
      LEFT JOIN LDS_LIVE.dbo.OWHS w ON iw.WhsCode = w.WhsCode
      LEFT JOIN LDS_LIVE.dbo.OITM m ON iw.ItemCode = m.ItemCode
      WHERE iw.ItemCode = @itemCode AND (iw.OnHand <> 0 OR iw.IsCommited <> 0 OR iw.OnOrder <> 0)
      ORDER BY iw.OnHand DESC
    `;

    // Recent movements (last 20)
    const movementsQuery = `
      SELECT TOP 20
        n.DocDate, n.Warehouse, n.TransType, n.InQty, n.OutQty, n.BASE_REF AS DocNumber
      FROM LDS_LIVE.dbo.OINM n
      WHERE n.ItemCode = @itemCode
      ORDER BY n.DocDate DESC, n.CreatedBy DESC
    `;

    // Batches
    const batchQuery = `
      SELECT
        b.DistNumber AS BatchNumber, q.WhsCode, q.Quantity, b.ExpDate,
        CASE WHEN b.ExpDate IS NOT NULL THEN DATEDIFF(DAY, GETDATE(), b.ExpDate) ELSE NULL END AS DaysUntilExpiry,
        b.U_QCDecision AS QCDecision
      FROM LDS_LIVE.dbo.OBTN b
      INNER JOIN LDS_LIVE.dbo.OBTQ q ON b.ItemCode = q.ItemCode AND b.SysNumber = q.SysNumber
      WHERE b.ItemCode = @itemCode AND q.Quantity > 0
      ORDER BY b.ExpDate ASC
    `;

    const [overviewRes, warehouseRes, movementsRes, batchRes] = await Promise.all([
      request.query(overviewQuery),
      request.query(warehouseQuery),
      request.query(movementsQuery),
      request.query(batchQuery),
    ]);

    const movements = movementsRes.recordset.map((row) => ({
      ...row,
      TransTypeName: getSapDocumentType(row.TransType),
    }));

    return res.json({
      success: true,
      data: {
        overview: overviewRes.recordset[0] || null,
        warehouses: warehouseRes.recordset,
        movements,
        batches: batchRes.recordset,
      },
    });
  } catch (error) {
    console.error("Item detail error:", error);
    return res.status(500).json({ success: false, message: "Unable to retrieve item details" });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/inventory/filters
// Filter options: warehouses, item groups, categories
// ═══════════════════════════════════════════════════════════════════════════════
async function getFilterOptions(req, res) {
  try {
    const pool = await poolPromise;

    const [warehouseRes, groupRes, categoryRes, divisionRes] = await Promise.all([
      pool.request().query(`SELECT WhsCode AS value, WhsName AS label FROM LDS_LIVE.dbo.OWHS ORDER BY WhsCode`),
      pool.request().query(`SELECT ItmsGrpCod AS value, ItmsGrpNam AS label FROM LDS_LIVE.dbo.OITB ORDER BY ItmsGrpNam`),
      pool.request().query(`SELECT DISTINCT U_cat1 AS value, U_cat1 AS label FROM LDS_LIVE.dbo.OITM WHERE U_cat1 IS NOT NULL AND U_cat1 <> '' ORDER BY U_cat1`),
      pool.request().query(`SELECT DISTINCT U_Division AS value, U_Division AS label FROM LDS_LIVE.dbo.OITM WHERE U_Division IS NOT NULL AND U_Division <> '' ORDER BY U_Division`),
    ]);

    return res.json({
      success: true,
      data: {
        warehouses: warehouseRes.recordset,
        itemGroups: groupRes.recordset,
        categories: categoryRes.recordset,
        divisions: divisionRes.recordset,
      },
    });
  } catch (error) {
    console.error("Filter options error:", error);
    return res.status(500).json({ success: false, message: "Unable to retrieve filter options" });
  }
}

module.exports = {
  getSummary,
  getCurrentStock,
  getWarehouseSummary,
  getItemGroupSummary,
  getMovements,
  getExpiry,
  getBatches,
  getPurchasePipeline,
  getCommitments,
  getProductionDemand,
  getItemDetail,
  getFilterOptions,
};
