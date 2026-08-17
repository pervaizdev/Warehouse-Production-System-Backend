const { poolPromise } = require("../../database/connection");

const safeInt = (val, defaultVal) => {
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? defaultVal : parsed;
};

const getRecommendations = async (req, res) => {
  try {
    const pool = await poolPromise;
    // Base history months for avg
    const historyMonths = safeInt(req.query.historyMonths, 6); 
    const targetDays = safeInt(req.query.targetDays, 30);
    const search = req.query.search || '';
    
    let query = `
      DECLARE @StartDate DATE = DATEADD(month, -${historyMonths}, GETDATE());

      WITH Deliveries AS (
          SELECT 
              d.ItemCode,
              SUM(d.Quantity) AS TotalDeliveredQty,
              MAX(h.DocDate) AS LastDeliveryDate
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
      SELECT 
          itm.ItemCode,
          itm.ItemName,
          ISNULL(s.OnHand, 0) AS OnHand,
          ISNULL(s.IsCommited, 0) AS IsCommited,
          ISNULL(s.OnHand, 0) - ISNULL(s.IsCommited, 0) AS NetAvailable,
          ISNULL(d.TotalDeliveredQty, 0) AS HistoricalDelivered,
          ISNULL(d.TotalDeliveredQty, 0) / ${historyMonths} AS MonthlyAvgDemand,
          (ISNULL(d.TotalDeliveredQty, 0) / ${historyMonths}) / 30 AS DailyAvgDemand,
          ISNULL(od.OpenSO, 0) AS OpenSO,
          ISNULL(op.OpenProd, 0) AS OpenProduction
      FROM LDS_Live.dbo.OITM itm (NOLOCK)
      INNER JOIN Deliveries d ON itm.ItemCode = d.ItemCode
      LEFT JOIN CurrentStock s ON itm.ItemCode = s.ItemCode
      LEFT JOIN OpenDemand od ON itm.ItemCode = od.ItemCode
      LEFT JOIN OpenProduction op ON itm.ItemCode = op.ItemCode
      WHERE 1=1
    `;

    if (search) {
      query += ` AND (itm.ItemCode LIKE '%${search}%' OR itm.ItemName LIKE '%${search}%')`;
    }

    const dataRes = await pool.request().query(query);
    
    // Apply logic in memory to calculate specific recommendations based on user params
    const processedData = dataRes.recordset.map(row => {
      // Logic from Master Prompt:
      // Net Requirement = Forecast Demand (TargetCoverage * DailyAvgDemand) + Open Customer Demand - Net Available - Open Production
      const targetBuffer = row.DailyAvgDemand * targetDays;
      const netRequirement = targetBuffer + row.OpenSO - row.NetAvailable - row.OpenProduction;
      
      const suggestedQty = Math.max(0, Math.ceil(netRequirement));
      const daysOfStock = row.DailyAvgDemand > 0 ? (row.NetAvailable / row.DailyAvgDemand) : 999;
      
      let priority = '4. Low';
      if (suggestedQty > 0) {
         if (row.NetAvailable < row.OpenSO) priority = '1. Critical';
         else if (daysOfStock < (targetDays / 2)) priority = '2. High';
         else priority = '3. Normal';
      } else {
         if (daysOfStock > (targetDays * 3) && row.DailyAvgDemand > 0) priority = 'Hold / Review';
      }

      let reason = `Target buffer: ${Math.ceil(targetBuffer)} (${targetDays} days). Available: ${row.NetAvailable}. Open SO: ${row.OpenSO}. Open Prod: ${row.OpenProduction}.`;
      
      return {
        ...row,
        SuggestedQty: suggestedQty,
        DaysOfStock: Math.round(daysOfStock),
        Priority: priority,
        Reason: reason
      };
    });
    
    // Sort by priority (1 to 4, then Hold)
    processedData.sort((a, b) => a.Priority.localeCompare(b.Priority));

    res.json({
      success: true,
      data: processedData,
    });
  } catch (error) {
    console.error("Error in getRecommendations:", error);
    res.status(500).json({ success: false, message: "Failed to fetch recommendations" });
  }
};

module.exports = {
  getRecommendations
};
