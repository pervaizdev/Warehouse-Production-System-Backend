const { poolPromise } = require('../../database/connection');
const sql = require('mssql');

exports.getProductionOrderDetails = async (req, res) => {
  try {
    const { itemCode } = req.params;
    
    if (!itemCode) {
        return res.status(400).json({ success: false, message: 'ItemCode is required' });
    }

    const pool = await poolPromise;

    // Header Query
    const headerQuery = `
      SELECT TOP 1
          CASE H.Type
              WHEN 'S' THEN 'Standard'
              WHEN 'P' THEN 'Special'
              WHEN 'D' THEN 'Disassembly'
              ELSE H.Type
          END AS [Type],
          
          CASE H.Status
              WHEN 'P' THEN 'Planned'
              WHEN 'R' THEN 'Released'
              WHEN 'L' THEN 'Closed'
              WHEN 'C' THEN 'Cancelled'
              ELSE H.Status
          END AS [Status],
          
          H.ItemCode AS [ProductNo],
          H.ProdName AS [ProductDescription],
          H.PlannedQty AS [PlannedQuantity],
          
          COALESCE(
              U.UomName,
              NULLIF(H.Uom, '')
          ) AS [UoMName],
          
          H.Warehouse AS [Warehouse],
          'Diagnostic' AS [Branch],
          H.Priority AS [Priority],
          
          CASE H.RouDatCalc
              WHEN 'S' THEN 'On Start Date'
              WHEN 'E' THEN 'On End Date'
              ELSE H.RouDatCalc
          END AS [RoutingDateCalculation],
          
          CASE
              WHEN H.ProcItms = 'Y' THEN 'Yes'
              ELSE 'No'
          END AS [ProcureItems],
          
          H.DocNum AS [No],
          H.PostDate AS [OrderDate],
          H.StartDate AS [StartDate],
          H.DueDate AS [DueDate],
          
          CASE
              WHEN H.OriginType = 'M' THEN 'Manual'
              ELSE H.OriginType
          END AS [Origin],
          
          CASE
              WHEN H.OriginType = 'R' THEN 'Sales Order'
              WHEN H.OriginType = 'M' THEN 'Manual'
              ELSE H.OriginType
          END AS [LinkedTo],
          
          H.OriginNum AS [LinkedOrder],
          H.CardCode AS [Customer],
          H.OcrCode AS [DistrRule],
          H.Project AS [Project]
          
      FROM LDS_LIVE.dbo.OWOR H
      LEFT JOIN LDS_LIVE.dbo.OUOM U ON U.UomEntry = H.UomEntry
      WHERE H.ItemCode = @ItemCode
      ORDER BY H.DocEntry DESC;
    `;

    // Lines Query
    const linesQuery = `
      ;WITH LatestProductionOrder AS
      (
          SELECT TOP 1
              H.DocEntry
          FROM LDS_LIVE.dbo.OWOR H
          WHERE H.ItemCode = @ItemCode
          ORDER BY H.DocEntry DESC
      )
      
      SELECT
          CASE
              WHEN L.ItemType = 4 THEN 'Item'
              WHEN L.ItemType = 290 THEN 'Resource'
              ELSE CAST(L.ItemType AS VARCHAR(20))
          END AS [Type],
          
          L.ItemCode AS [No],
          L.ItemName AS [Description],
          L.BaseQty AS [BaseQty],
          
          (
              SELECT TOP 1
                  CAST(CAST(L.BaseQty * N.N AS INT) AS VARCHAR(20))
                  + '/'
                  + CAST(N.N AS VARCHAR(20))
              FROM
              (
                  SELECT TOP (1000)
                      ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS N
                  FROM sys.all_objects A
                  CROSS JOIN sys.all_objects B
              ) N
              WHERE
                  L.BaseQty IS NOT NULL
                  AND L.BaseQty > 0
                  AND ABS(
                      (L.BaseQty * N.N)
                      - ROUND(L.BaseQty * N.N, 0)
                  ) < 0.000001
              ORDER BY N.N
          ) AS [BaseRatio],
          
          L.PlannedQty AS [PlannedQty],
          L.IssuedQty AS [Issued],
          
          CASE
              WHEN L.ItemType = 4
              THEN
                  ISNULL(W.OnHand, 0)
                  - ISNULL(W.IsCommited, 0)
      
              WHEN L.ItemType = 290
              THEN
                  -L.IssuedQty
      
              ELSE NULL
          END AS [Available],
          
          COALESCE(
              NULLIF(L.Project, ''),
              NULLIF(H.Project, '')
          ) AS [Project],
          
          COALESCE(
              NULLIF(L.UomCode, ''),
              NULLIF(U.UomCode, '')
          ) AS [UoMCode],
          
          U.UomName AS [UoMName],
          L.wareHouse AS [Warehouse],
          
          CASE L.IssueType
              WHEN 'M' THEN 'Manual'
              WHEN 'B' THEN 'Backflush'
              ELSE L.IssueType
          END AS [IssueMethod],
          
          L.WipActCode AS [WIPAccount],
          L.OcrCode AS [Department],
          L.OcrCode2 AS [BusinessSegment],
          'Diagnostic' AS [Branch],
          ISNULL(L.StageId, 0) AS [RouteSequence],
          
          CASE
              WHEN L.PoDocNum IS NOT NULL
                   AND L.PoDocNum <> 0
              THEN CAST(L.PoDocNum AS VARCHAR(30))
              ELSE NULL
          END AS [ProcurementDoc],
          
          CASE
              WHEN L.AlwProcDoc = 'Y'
              THEN 'Yes'
              ELSE 'No'
          END AS [AllowProcurmtDoc]
          
      FROM LatestProductionOrder LP
      INNER JOIN LDS_LIVE.dbo.OWOR H ON H.DocEntry = LP.DocEntry
      INNER JOIN LDS_LIVE.dbo.WOR1 L ON H.DocEntry = L.DocEntry
      LEFT JOIN LDS_LIVE.dbo.OITW W ON W.ItemCode = L.ItemCode AND W.WhsCode = L.wareHouse
      LEFT JOIN LDS_LIVE.dbo.OUOM U ON U.UomEntry = L.UomEntry
      ORDER BY L.VisOrder, L.LineNum;
    `;

    const request1 = pool.request();
    request1.input('ItemCode', sql.NVarChar(50), itemCode);

    const request2 = pool.request();
    request2.input('ItemCode', sql.NVarChar(50), itemCode);

    const [headerResult, linesResult] = await Promise.all([
      request1.query(headerQuery),
      request2.query(linesQuery)
    ]);

    const header = headerResult.recordset.length > 0 ? headerResult.recordset[0] : null;
    const lines = linesResult.recordset || [];

    res.status(200).json({
      success: true,
      data: {
        header,
        lines
      }
    });

  } catch (error) {
    console.error("Error fetching production order details:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getProductionProducts = async (req, res) => {
  try {
    const pool = await poolPromise;
    const query = `SELECT Code, Name FROM LDS_LIVE.dbo.OITT WHERE TreeType='P'`;
    const result = await pool.request().query(query);
    
    res.status(200).json({
      success: true,
      data: result.recordset
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getWarehouses = async (req, res) => {
  try {
    const pool = await poolPromise;
    const query = `SELECT WhsCode, WhsName FROM LDS_LIVE.dbo.OWHS`;
    const result = await pool.request().query(query);
    
    res.status(200).json({
      success: true,
      data: result.recordset
    });
  } catch (error) {
    console.error("Error fetching warehouses:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getOpenSalesOrders = async (req, res) => {
  try {
    const pool = await poolPromise;
    const query = `SELECT DocNum, DocDate, CardName, Comments FROM LDS_LIVE.dbo.ORDR WHERE DocStatus = 'O'`;
    const result = await pool.request().query(query);
    
    res.status(200).json({
      success: true,
      data: result.recordset
    });
  } catch (error) {
    console.error("Error fetching open sales orders:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getOpenProductionOrders = async (req, res) => {
  try {
    const pool = await poolPromise;
    const query = `SELECT DocNum, Project, DueDate, ProdName, PlannedQty FROM LDS_LIVE.dbo.OWOR WHERE Status NOT IN ('C','L')`;
    const result = await pool.request().query(query);
    
    res.status(200).json({
      success: true,
      data: result.recordset
    });
  } catch (error) {
    console.error("Error fetching open production orders:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getCustomers = async (req, res) => {
  try {
    const pool = await poolPromise;
    const query = `SELECT CardCode, CardName FROM LDS_LIVE.dbo.OCRD WHERE CardType='C'`;
    const result = await pool.request().query(query);
    
    res.status(200).json({
      success: true,
      data: result.recordset
    });
  } catch (error) {
    console.error("Error fetching customers:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getBOMDetails = async (req, res) => {
  try {
    const { itemCode } = req.params;
    
    if (!itemCode) {
        return res.status(400).json({ success: false, message: 'ItemCode is required' });
    }

    const pool = await poolPromise;

    // Header Query (from OITT and OITM)
    const headerQuery = `
      SELECT 
          'Standard' AS [Type],
          'Planned' AS [Status],
          T.Code AS [ProductNo],
          I.ItemName AS [ProductDescription],
          1 AS [PlannedQuantity],
          I.InvntryUom AS [UoMName],
          '04' AS [Warehouse],
          'Diagnostic' AS [Branch],
          GETDATE() AS [OrderDate],
          GETDATE() AS [StartDate],
          GETDATE() AS [DueDate],
          'Manual' AS [Origin]
      FROM LDS_LIVE.dbo.OITT T
      INNER JOIN LDS_LIVE.dbo.OITM I ON T.Code = I.ItemCode
      WHERE T.Code = @ItemCode
    `;

    // Lines Query (from ITT1 and OITM/OITW)
    const linesQuery = `
      SELECT
          CASE
              WHEN L.Type = 4 THEN 'Item'
              WHEN L.Type = 290 THEN 'Resource'
              WHEN L.Type = -1 THEN 'Route Stage'
              ELSE CAST(L.Type AS VARCHAR(20))
          END AS [Type],
          
          L.Code AS [No],
          COALESCE(I.ItemName, R.ResName) AS [Description],
          L.Quantity AS [BaseQty],
          
          (
              SELECT TOP 1
                  CAST(CAST(L.Quantity * N.N AS INT) AS VARCHAR(20))
                  + '/'
                  + CAST(N.N AS VARCHAR(20))
              FROM
              (
                  SELECT TOP (1000)
                      ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS N
                  FROM sys.all_objects A
                  CROSS JOIN sys.all_objects B
              ) N
              WHERE
                  L.Quantity IS NOT NULL
                  AND L.Quantity > 0
                  AND ABS(
                      (L.Quantity * N.N)
                      - ROUND(L.Quantity * N.N, 0)
                  ) < 0.000001
              ORDER BY N.N
          ) AS [BaseRatio],
          
          L.Quantity AS [PlannedQty],
          0 AS [Issued],
          
          CASE
              WHEN L.Type = 4
              THEN
                  ISNULL(W.OnHand, 0)
                  - ISNULL(W.IsCommited, 0)
              ELSE 0
          END AS [Available],
          
          NULL AS [Project],
          NULL AS [UoMCode],
          I.InvntryUom AS [UoMName],
          L.Warehouse AS [Warehouse],
          
          CASE L.IssueMthd
              WHEN 'M' THEN 'Manual'
              WHEN 'B' THEN 'Backflush'
              ELSE L.IssueMthd
          END AS [IssueMethod],
          
          L.WipActCode AS [WIPAccount],
          NULL AS [Department],
          NULL AS [BusinessSegment],
          'Diagnostic' AS [Branch],
          0 AS [RouteSequence],
          NULL AS [ProcurementDoc],
          'No' AS [AllowProcurmtDoc]
          
      FROM LDS_LIVE.dbo.ITT1 L
      LEFT JOIN LDS_LIVE.dbo.OITM I ON L.Code = I.ItemCode AND L.Type = 4
      LEFT JOIN LDS_LIVE.dbo.ORSC R ON L.Code = R.ResCode AND L.Type = 290
      LEFT JOIN LDS_LIVE.dbo.OITW W ON L.Code = W.ItemCode AND L.Warehouse = W.WhsCode
      WHERE L.Father = @ItemCode
      ORDER BY L.VisOrder, L.ChildNum;
    `;

    const request1 = pool.request();
    request1.input('ItemCode', sql.NVarChar(50), itemCode);

    const request2 = pool.request();
    request2.input('ItemCode', sql.NVarChar(50), itemCode);

    const [headerResult, linesResult] = await Promise.all([
      request1.query(headerQuery),
      request2.query(linesQuery)
    ]);

    const header = headerResult.recordset.length > 0 ? headerResult.recordset[0] : null;
    const lines = linesResult.recordset || [];

    res.status(200).json({
      success: true,
      data: {
        header,
        lines
      }
    });

  } catch (error) {
    console.error("Error fetching BOM details:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
