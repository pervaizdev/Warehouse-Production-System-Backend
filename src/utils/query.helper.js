/**
 * query.helper.js — SQL Query Utilities
 * 
 * THE MOST IMPORTANT FILE FOR PERFORMANCE!
 * 
 * This is what makes your frontend "instantly render in a smooth professional way."
 * 
 * ═══════════════════════════════════════════════════════════════
 *Server-Side Pagination vs Client-Side Pagination
 * ═══════════════════════════════════════════════════════════════

 * 
 *    SELECT * FROM Items
 *    WHERE Name LIKE '%search%'                   ← Filter in DB (fast index scan)
 *    ORDER BY CreatedAt DESC
 *    OFFSET 0 ROWS FETCH NEXT 20 ROWS ONLY       ← DB returns only 20 rows
 *    Frontend: just render what it gets             ← Instant!
 * 
 * The database is MUCH faster at filtering/sorting than JavaScript.
 * SQL Server can use indexes. Your JS array.filter() can't.
 * ═══════════════════════════════════════════════════════════════
 * 
 * USAGE in controllers:
 *   const { parsePagination, buildSearchCondition } = require("../../utils/query.helper");
 *   
 *   const { page, limit, offset } = parsePagination(req.query);
 *   const { condition, inputs } = buildSearchCondition(req.query.search, ["Name", "Code"]);
 */

const { MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE } = require("../config/app.config");

/**
 * Parse pagination parameters from query string
 * 
 * Frontend sends: GET /api/items?page=2&limit=20
 * This returns:   { page: 2, limit: 20, offset: 20 }
 * 
 * OFFSET = how many rows to skip = (page - 1) * limit
 * Page 1: OFFSET 0  (skip 0, show rows 1-20)
 * Page 2: OFFSET 20 (skip 20, show rows 21-40)
 * Page 3: OFFSET 40 (skip 40, show rows 41-60)
 * 
 * @param {object} query - req.query from Express
 * @returns {{ page: number, limit: number, offset: number }}
 */
function parsePagination(query = {}) {
  let page = parseInt(query.page) || 1;
  let limit = parseInt(query.limit) || DEFAULT_PAGE_SIZE;

  // Safety: clamp values
  if (page < 1) page = 1;
  if (limit < 1) limit = DEFAULT_PAGE_SIZE;
  if (limit > MAX_PAGE_SIZE) limit = MAX_PAGE_SIZE;

  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

/**
 * Build a SQL WHERE condition for searching across multiple columns
 * 
 * Frontend sends: GET /api/items?search=laptop
 * This builds:    WHERE (Name LIKE '%laptop%' OR Code LIKE '%laptop%')
 * 
 * WHY parameterized?
 * NEVER concatenate user input directly into SQL:
 *   ❌ `WHERE Name LIKE '%${search}%'`     ← SQL INJECTION! Hacker can drop your DB
 *   ✅ `WHERE Name LIKE @search`            ← Safe, SQL Server handles escaping
 * 
 * @param {string} searchTerm - The search string from req.query.search
 * @param {string[]} columns - Array of column names to search across
 * @returns {{ condition: string, searchValue: string }}
 */
function buildSearchCondition(searchTerm, columns = []) {
  if (!searchTerm || !searchTerm.trim() || columns.length === 0) {
    return { condition: "", searchValue: "" };
  }

  const conditions = columns.map((col) => `${col} LIKE @search`).join(" OR ");
  return {
    condition: `(${conditions})`,
    searchValue: `%${searchTerm.trim()}%`,
  };
}

/**
 * Build ORDER BY clause from query parameters
 * 
 * Frontend sends: GET /api/items?sortBy=Name&sortOrder=asc
 * This returns:   "Name ASC"
 * 
 * @param {object} query - req.query
 * @param {string[]} allowedColumns - Whitelist of sortable columns (security!)
 * @param {string} defaultSort - Default sort if none specified
 * @returns {string} SQL ORDER BY value
 */
function buildSortClause(query = {}, allowedColumns = [], defaultSort = "CreatedAt DESC") {
  const { sortBy, sortOrder } = query;

  if (!sortBy || !allowedColumns.includes(sortBy)) {
    return defaultSort;
  }

  const direction = sortOrder?.toUpperCase() === "ASC" ? "ASC" : "DESC";
  return `${sortBy} ${direction}`;
}

module.exports = { parsePagination, buildSearchCondition, buildSortClause };
