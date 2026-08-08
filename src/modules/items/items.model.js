
const {sql,poolPromise}=require("../../database/connection");

class ItemModel{

    static async getInventoryDashboard(){
        const pool=await poolPromise;
        const query=`SELECT 
        * FROM gms_live.dbo.Item where `;
        const result=await pool.request().query(query);
        return result.recordset;
    }
}

module.exports=ItemModel;