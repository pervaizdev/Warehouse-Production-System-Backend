const fs = require('fs');
const data = JSON.parse(fs.readFileSync('discovery_deep.json', 'utf8'));

// Extract key findings
const summary = {};

// 1. OWOR Schema - just column names
summary.OWOR_COLUMNS = data.OWOR_SCHEMA.map(r => r.COLUMN_NAME);

// 2. Recent OWOR - key fields only
summary.OWOR_RECENT = data.OWOR_RECENT.map(r => ({
  DocEntry: r.DocEntry, DocNum: r.DocNum, ItemCode: r.ItemCode, Status: r.Status, Type: r.Type,
  PlannedQty: r.PlannedQty, CmpltQty: r.CmpltQty, RjctQty: r.RjctQty,
  PostDate: r.PostDate, DueDate: r.DueDate, StartDate: r.StartDate,
  Warehouse: r.Warehouse, OcrCode: r.OcrCode, Project: r.Project, CardCode: r.CardCode
}));

// 3. Status counts
summary.OWOR_STATUS_COUNTS = data.OWOR_STATUS_COUNTS;

// 4. WOR1 columns
summary.WOR1_COLUMNS = data.WOR1_SCHEMA.map(r => r.COLUMN_NAME);

// 5. WOR1 ItemType distribution (key: 4=item, 290=resource)
summary.WOR1_ITEM_TYPES = data.WOR1_ITEM_TYPES;

// 6. ORSC - all resources
summary.ORSC_ALL = data.ORSC_ALL;

// 7. Trace order
summary.TRACE_ORDER = data.TRACE_ORDER ? {
  DocEntry: data.TRACE_ORDER.DocEntry, DocNum: data.TRACE_ORDER.DocNum,
  ItemCode: data.TRACE_ORDER.ItemCode, Status: data.TRACE_ORDER.Status,
  PlannedQty: data.TRACE_ORDER.PlannedQty, CmpltQty: data.TRACE_ORDER.CmpltQty,
  Warehouse: data.TRACE_ORDER.Warehouse, PostDate: data.TRACE_ORDER.PostDate
} : null;

// 8. Trace WOR1
summary.TRACE_WOR1 = (data.TRACE_WOR1 || []).map(r => ({
  LineNum: r.LineNum, ItemCode: r.ItemCode, ItemType: r.ItemType,
  PlannedQty: r.PlannedQty, IssuedQty: r.IssuedQty, BaseQty: r.BaseQty,
  WareHouse: r.WareHouse, IssueType: r.IssueType, StockPrice: r.StockPrice
}));

// 9. Trace IGE1
summary.TRACE_IGE1 = (data.TRACE_IGE1 || []).map(r => ({
  DocEntry: r.DocEntry, ItemCode: r.ItemCode, Quantity: r.Quantity,
  Price: r.Price, LineTotal: r.LineTotal, WhsCode: r.WhsCode,
  StockPrice: r.StockPrice, INMPrice: r.INMPrice, AcctCode: r.AcctCode
}));

// 10. Trace IGN1
summary.TRACE_IGN1 = (data.TRACE_IGN1 || []).map(r => ({
  DocEntry: r.DocEntry, ItemCode: r.ItemCode, Quantity: r.Quantity,
  Price: r.Price, LineTotal: r.LineTotal, WhsCode: r.WhsCode,
  StockPrice: r.StockPrice, INMPrice: r.INMPrice, AcctCode: r.AcctCode
}));

// 11. UDFs
summary.OWOR_UDF = data.OWOR_UDF;
summary.WOR1_UDF = data.WOR1_UDF;
summary.OITM_UDF = data.OITM_UDF;
summary.IGE1_UDF = data.IGE1_UDF;
summary.IGN1_UDF = data.IGN1_UDF;

// 12. OITM valuation
summary.OITM_VALUATION = (data.OITM_VALUATION || []).map(r => ({
  ItemCode: r.ItemCode, ItemName: r.ItemName, EvalSystem: r.EvalSystem,
  AvgPrice: r.AvgPrice, LastPurPrc: r.LastPurPrc, LstEvlPric: r.LstEvlPric,
  ItmsGrpCod: r.ItmsGrpCod, InvntryUom: r.InvntryUom
}));

// 13. OITM EvalSystem
summary.OITM_EVAL_SYSTEMS = data.OITM_EVAL_SYSTEMS;

// 14. Price lists
summary.OPLN_PRICE_LISTS = (data.OPLN_PRICE_LISTS || []).map(r => ({
  ListNum: r.ListNum, ListName: r.ListName
}));
summary.ITM1_PRICE_LISTS = data.ITM1_PRICE_LISTS;

// 15. Data quality
summary.DQ_ISSUES_NO_RECEIPT = data.DQ_ISSUES_NO_RECEIPT;
summary.DQ_RECEIPT_NO_ISSUE = data.DQ_RECEIPT_NO_ISSUE;

// 16. Record counts
summary.RECORD_COUNTS = data.RECORD_COUNTS;

// 17. WOR4/IGE22/IGN22
summary.WOR4_SCHEMA_COLS = (data.WOR4_SCHEMA || []).map(r => r.COLUMN_NAME);
summary.WOR4_COUNT = data.WOR4_COUNT;
summary.IGE22_COUNT = data.IGE22_COUNT;
summary.IGN22_COUNT = data.IGN22_COUNT;
summary.IGE22_SCHEMA_COLS = (data.IGE22_SCHEMA || []).map(r => r.COLUMN_NAME);
summary.IGN22_SCHEMA_COLS = (data.IGN22_SCHEMA || []).map(r => r.COLUMN_NAME);

// 18. RSC4
summary.RSC4_SCHEMA_COLS = (data.RSC4_SCHEMA || []).map(r => r.COLUMN_NAME);
summary.RSC4_SAMPLE = data.RSC4_SAMPLE;

// 19. RSC1
summary.RSC1_SCHEMA_COLS = (data.RSC1_SCHEMA || []).map(r => r.COLUMN_NAME);
summary.RSC1_SAMPLE = data.RSC1_SAMPLE;

// 20. OHEM count
summary.OHEM_COUNT = data.OHEM_COUNT;

console.log(JSON.stringify(summary, null, 2));
