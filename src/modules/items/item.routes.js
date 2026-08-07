const router = require("express").Router;
const itemController=require("./item.controller");

router.get("/get",itemController.getitems());


module.exports=router;
