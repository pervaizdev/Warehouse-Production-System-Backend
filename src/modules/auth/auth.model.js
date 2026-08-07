/**
 * auth.model.js — Authentication Database Queries
 * 
 *
 */

const { sql, poolPromise } = require("../../database/connection");

class AuthModel {
  /**
  
   * 
   * @param {string} email 
   * @returns {Promise<object|null>}
   */
  static async findUserByEmail(email) {
    const pool = await poolPromise;
    
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
