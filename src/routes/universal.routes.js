import express from "express"
import { BaseController } from "../framework/BaseController.js"
import   validator      from "../middleware/validate.js";
import { tokenauth } from "../middleware/authMeddlware.js";
import { authorizeCheck } from "../middleware/authorizeCheck.js";



const universalRouter=express.Router({mergeParams:true});
const universalController=new BaseController();

universalRouter.get("/",tokenauth       ,universalController.findAll);
universalRouter.get("/:id",tokenauth    ,universalController.findById);
universalRouter.post("/",tokenauth      ,validator,universalController.create);
universalRouter.put("/:id",tokenauth    ,validator,universalController.update);
universalRouter.delete("/:id",tokenauth ,universalController.remove);



export default universalRouter
