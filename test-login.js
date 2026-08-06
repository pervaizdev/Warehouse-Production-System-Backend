require("dotenv").config();
const { sql, getPool } = require("./src/database/connection");

async function test() {
  try {
    const pool = await getPool("primary");
    const email = "m.atique@gms-world.co";
    
    const query = `
        SELECT * FROM (
          SELECT a.UserID as empId, b.officeEmail as email, a.PassCode AS [Password], b.FirstName as fullName, 'HCM_GMS' AS SourceDB
          FROM HCM_GMS.dbo.MstUsers a
          JOIN HCM_GMS.dbo.MstEmployee b ON a.UserID = b.EmpID
          WHERE b.flgActive = 1 AND b.officeEmail = @email

          UNION ALL

          SELECT a.UserID as empId, b.OfficialEmail AS email, a.PassCode AS [Password], b.EmployeeName AS fullName, 'Visole' AS SourceDB
          FROM Visole.dbo.MstUsers a
          JOIN Visole.dbo.MstEmployee b ON a.UserID = b.Empid
          WHERE b.flgactive = 1 AND b.OfficialEmail = @email
        ) t
      `;

    const result = await pool.request()
      .input("email", sql.NVarChar, email)
      .query(query);
      
    console.log("User:", result.recordset[0]);
  } catch (err) {
    console.error("Error:", err);
  } finally {
    process.exit();
  }
}
test();
