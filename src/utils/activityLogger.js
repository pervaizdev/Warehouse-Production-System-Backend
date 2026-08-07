const { sql, poolPromise } = require("../database/connection");
const logger = require("./logger");

/**
 * Logs an action to the wms_activity_logs table.
 * 
 * @param {Object} params
 * @param {number} params.empId - Employee ID who performed the action
 * @param {string} params.actionType - Type of action (e.g. 'LOGIN', 'LOGOUT', 'CREATE')
 * @param {string} params.moduleName - Module name (e.g. 'AUTH', 'INVENTORY')
 * @param {string} [params.entityId] - The ID of the affected record (optional)
 * @param {string} [params.description] - Human readable description (optional)
 * @param {string} [params.ipAddress] - IP Address of the user (optional)
 */
async function logActivity({ empId, actionType, moduleName, entityId = null, description = null, ipAddress = null }) {
  try {
    const pool = await poolPromise;
    const query = `
      INSERT INTO wms_activity_logs (emp_id, action_type, module_name, entity_id, description, ip_address)
      VALUES (@empId, @actionType, @moduleName, @entityId, @description, @ipAddress)
    `;

    await pool.request()
      .input("empId", sql.Int, empId)
      .input("actionType", sql.VarChar(50), actionType)
      .input("moduleName", sql.VarChar(50), moduleName)
      .input("entityId", sql.VarChar(100), entityId)
      .input("description", sql.NVarChar(sql.MAX), description)
      .input("ipAddress", sql.VarChar(45), ipAddress)
      .query(query);

  } catch (error) {
    // We catch the error so that logging failure doesn't crash the main API response
    logger.error("Failed to insert activity log:", error);
  }
}

module.exports = { logActivity };
