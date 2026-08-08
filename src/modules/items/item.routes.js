const router = require("express").Router;
const itemController=require("./item.controller");

router.get("/inventory/dashboard",itemController.getInventoryDashboard());


module.exports=router;
