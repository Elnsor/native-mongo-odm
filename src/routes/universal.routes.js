import express from "express"
import { BaseController } from "../framework/BaseController.js"
import   validator      from "../middleware/validate.js";
import { tokenauth } from "../middleware/authMeddlware.js";
import { authorizeCheck } from "../middleware/authorizeCheck.js";



const universalRouter=express.Router({mergeParams:true});
const universalController=new BaseController();

universalRouter.get("/",tokenauth       ,authorizeCheck('read'),universalController.findAll);
universalRouter.get("/:id",tokenauth    ,authorizeCheck('read'),universalController.findById);
universalRouter.post("/:id",tokenauth      ,authorizeCheck('write'),validator,universalController.create);
universalRouter.put("/:id",tokenauth    ,authorizeCheck('update'),validator,universalController.update);
universalRouter.delete("/:id",tokenauth ,authorizeCheck('delete'),universalController.remove);



export default universalRouter
