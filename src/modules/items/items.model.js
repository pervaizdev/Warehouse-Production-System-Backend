
const {sql,poolPromise}=require("../../database/connection");

class ItemModel{

    static async getitems(){
        const pool=await poolPromise;
        const query=`SELECT * FROM gms_live.dbo.Item where `;
        const result=await pool.request().query(query);
        return result.recordset;
    }
}