const jwt=require("jsonwebtoken");
const itemModel=require("./item.model");
const { sendSuccess, sendError } = require("../../utils/response.helper");
const { logActivity } = require("../../utils/activityLogger");


class ItemController{

    static async getitems(req,res){

        try{
            const items=await itemModel.getitems()
            sendSuccess(res,items,"items fetched successfully");

        }catch(err){
            sendError(res,"items not fetched successfully",err.statusCode);
        }
    }

}

module.exports=ItemController;