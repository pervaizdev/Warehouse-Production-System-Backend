const { poolPromise } = require("../../database/connection");

const safeInt = (val, defaultVal) => {
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? defaultVal : parsed;
};

const getProductHistory = async (req, res) => {
  try {
    const pool = await poolPromise;
    const months = safeInt(req.query.months, 3);
    const search = req.query.search || '';
    const page = safeInt(req.query.page, 1);
    const pageSize = safeInt(req.query.pageSize, 20);
    const offset = (page - 1) * pageSize;
    
    const baseCte = `
      WITH Production AS (
          SELECT 
              i.ItemCode,
              SUM(i.Quantity) AS ProducedQty,
              MAX(h.DocDate) AS LastProductionDate,
              COUNT(DISTINCT h.DocNum) AS NumProductionReceipts
          FROM LDS_Live.dbo.IGN1 i (NOLOCK)
          INNER JOIN LDS_Live.dbo.OIGN h (NOLOCK) ON i.DocEntry = h.DocEntry
          WHERE i.BaseType = 202 AND h.DocDate >= @StartDate
          GROUP BY i.ItemCode
      ),
      Deliveries AS (
          SELECT 
              d.ItemCode,
              SUM(d.Quantity) AS DeliveredQty,
              MAX(h.DocDate) AS LastDeliveryDate,
              COUNT(DISTINCT h.DocNum) AS NumDeliveries
          FROM LDS_Live.dbo.DLN1 d (NOLOCK)
          INNER JOIN LDS_Live.dbo.ODLN h (NOLOCK) ON d.DocEntry = h.DocEntry
          WHERE h.DocDate >= @StartDate
          GROUP BY d.ItemCode
      ),
      CurrentStock AS (
          SELECT ItemCode, SUM(OnHand) AS OnHand, SUM(IsCommited) AS IsCommited
          FROM LDS_Live.dbo.OITW (NOLOCK)
          GROUP BY ItemCode
      ),
      OpenDemand AS (
          SELECT ItemCode, SUM(OpenQty) AS OpenSO
          FROM LDS_Live.dbo.RDR1 (NOLOCK)
          WHERE OpenQty > 0
          GROUP BY ItemCode
      ),
      OpenProduction AS (
          SELECT ItemCode, SUM(PlannedQty - CmpltQty) AS OpenProd
          FROM LDS_Live.dbo.OWOR (NOLOCK)
          WHERE Status IN ('P', 'R') AND (PlannedQty - CmpltQty) > 0
          GROUP BY ItemCode
      )
    `;

    let selectQuery = `
      SELECT 
          itm.ItemCode,
          itm.ItemName,
          ISNULL(s.OnHand, 0) AS OnHand,
          ISNULL(s.IsCommited, 0) AS IsCommited,
          ISNULL(s.OnHand, 0) - ISNULL(s.IsCommited, 0) AS AvailableQty,
          ISNULL(p.ProducedQty, 0) AS ProducedQty,
          ISNULL(d.DeliveredQty, 0) AS DeliveredQty,
          ISNULL(od.OpenSO, 0) AS OpenSO,
          ISNULL(op.OpenProd, 0) AS OpenProduction,
          ISNULL(p.ProducedQty, 0) - ISNULL(d.DeliveredQty, 0) AS NetProduction,
          CAST(p.LastProductionDate AS DATE) AS LastProductionDate,
          CAST(d.LastDeliveryDate AS DATE) AS LastDeliveryDate,
          ISNULL(p.ProducedQty, 0) / NULLIF((ISNULL(d.DeliveredQty, 0)), 0) AS ProdToDelvRatio
      FROM LDS_Live.dbo.OITM itm (NOLOCK)
      LEFT JOIN Production p ON itm.ItemCode = p.ItemCode
      LEFT JOIN Deliveries d ON itm.ItemCode = d.ItemCode
      LEFT JOIN CurrentStock s ON itm.ItemCode = s.ItemCode
      LEFT JOIN OpenDemand od ON itm.ItemCode = od.ItemCode
      LEFT JOIN OpenProduction op ON itm.ItemCode = op.ItemCode
      WHERE (ISNULL(p.ProducedQty, 0) > 0 OR ISNULL(d.DeliveredQty, 0) > 0 OR ISNULL(s.OnHand, 0) > 0 OR ISNULL(od.OpenSO, 0) > 0)
    `;

    if (search) {
      selectQuery += ` AND (itm.ItemCode LIKE '%${search}%' OR itm.ItemName LIKE '%${search}%')`;
    }

    const countQuery = `
      DECLARE @StartDate DATE = DATEADD(month, -${months}, GETDATE());
      ${baseCte}
      SELECT COUNT(*) as count FROM (${selectQuery}) AS t
    `;

    const countRes = await pool.request().query(countQuery);
    const totalRecords = countRes.recordset[0].count;

    const dataQuery = `
      DECLARE @StartDate DATE = DATEADD(month, -${months}, GETDATE());
      ${baseCte}
      ${selectQuery}
      ORDER BY ISNULL(d.DeliveredQty, 0) DESC, ISNULL(p.ProducedQty, 0) DESC
      OFFSET ${offset} ROWS FETCH NEXT ${pageSize} ROWS ONLY
    `;

    const dataRes = await pool.request().query(dataQuery);
    
    res.json({
      success: true,
      data: dataRes.recordset,
      pagination: {
        totalRecords,
        currentPage: page,
        pageSize,
        totalPages: Math.ceil(totalRecords / pageSize)
      }
    });
  } catch (error) {
    console.error("Error in getProductHistory:", error);
    res.status(500).json({ success: false, message: "Failed to fetch product history" });
  }
};

const getTrendData = async (req, res) => {
  try {
    const pool = await poolPromise;
    const months = safeInt(req.query.months, 8);
    
    const query = `
      DECLARE @StartDate DATE = DATEADD(month, -${months}, GETDATE());

      WITH Months AS (
          SELECT FORMAT(DATEADD(month, -number, GETDATE()), 'yyyy-MM') as MonthKey,
                 DATEADD(month, -number, GETDATE()) as MonthDate
          FROM master..spt_values
          WHERE type = 'P' AND number <= ${months}
      ),
      Production AS (
          SELECT 
              FORMAT(h.DocDate, 'yyyy-MM') AS MonthKey,
              SUM(i.Quantity) AS ProducedQty
          FROM LDS_Live.dbo.IGN1 i (NOLOCK)
          INNER JOIN LDS_Live.dbo.OIGN h (NOLOCK) ON i.DocEntry = h.DocEntry
          WHERE i.BaseType = 202 AND h.DocDate >= @StartDate
          GROUP BY FORMAT(h.DocDate, 'yyyy-MM')
      ),
      Deliveries AS (
          SELECT 
              FORMAT(h.DocDate, 'yyyy-MM') AS MonthKey,
              SUM(d.Quantity) AS DeliveredQty
          FROM LDS_Live.dbo.DLN1 d (NOLOCK)
          INNER JOIN LDS_Live.dbo.ODLN h (NOLOCK) ON d.DocEntry = h.DocEntry
          WHERE h.DocDate >= @StartDate
          GROUP BY FORMAT(h.DocDate, 'yyyy-MM')
      )
      SELECT 
          m.MonthKey,
          ISNULL(p.ProducedQty, 0) AS ProducedQty,
          ISNULL(d.DeliveredQty, 0) AS DeliveredQty,
          ISNULL(p.ProducedQty, 0) - ISNULL(d.DeliveredQty, 0) AS Variance
      FROM Months m
      LEFT JOIN Production p ON m.MonthKey = p.MonthKey
      LEFT JOIN Deliveries d ON m.MonthKey = d.MonthKey
      ORDER BY m.MonthDate ASC
    `;

    const dataRes = await pool.request().query(query);
    
    res.json({
      success: true,
      data: dataRes.recordset,
    });
  } catch (error) {
    console.error("Error in getTrendData:", error);
    res.status(500).json({ success: false, message: "Failed to fetch trend data" });
  }
};

module.exports = {
  getProductHistory,
  getTrendData
};
