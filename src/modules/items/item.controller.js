const jwt=require("jsonwebtoken");
const itemModel=require("./item.model");
const { sendSuccess, sendError } = require("../../utils/response.helper");
const { logActivity } = require("../../utils/activityLogger");


class ItemController{

    static async getInventoryDashboard(req,res){

        try{
            const items=await itemModel.getInventoryDashboard()
            sendSuccess(res,items,"items fetched successfully");

        }catch(err){
            sendError(res,"items not fetched successfully",err.statusCode);
        }
    }

}

module.exports=ItemController;