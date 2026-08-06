/**
 * auth.model.js — Authentication Database Queries
 * 
 * MODEL RULES:
 * 1. ONLY database logic belongs here (SELECT, INSERT, UPDATE, DELETE).
 * 2. Return clean data objects to the controller.
 * 3. Never handle req/res directly in this file.
 */

const { sql, getPool } = require("../../database/connection");

class AuthModel {
  /**
   * Find a user by their email address in the HCM_GMS database.
   * Visole DB is excluded as Visole employees do not use WMS.
   * 
   * @param {string} email 
   * @returns {Promise<object|null>}
   */
  static async findUserByEmail(email) {
    const pool = await getPool("primary");
    
    const query = `
      SELECT 
        a.UserID as empId, 
        b.officeEmail as email, 
        a.PassCode AS [Password], 
        b.FirstName as fullName, 
        'HCM_GMS' AS SourceDB
      FROM HCM_GMS.dbo.MstUsers a
      JOIN HCM_GMS.dbo.MstEmployee b ON a.UserID = b.EmpID
      WHERE b.flgActive = 1 AND b.officeEmail = @email
    `;

    const result = await pool.request()
      .input("email", sql.NVarChar, email)
      .query(query);

    return result.recordset[0] || null;
  }
}

module.exports = AuthModel;
