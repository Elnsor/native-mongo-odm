import express from "express"
import { BaseController } from "../framework/BaseController.js"
import   validator      from "../middleware/validate.js";
import { tokenauth } from "../middleware/authMeddlware.js";
import { authorizeCheck } from "../middleware/authorizeCheck.js";
import validationCollection from "../middleware/appRolesMeddlware.js"
import { selectProjection } from "../middleware/projectionMeddleware.js";



const universalRouter=express.Router({mergeParams:true});
const universalController=new BaseController();

universalRouter.get("/",tokenauth       ,authorizeCheck('read'),selectProjection,universalController.findAll);
universalRouter.get("/:id",tokenauth    ,authorizeCheck('read'),selectProjection,universalController.findById);
universalRouter.post("/",tokenauth      ,authorizeCheck('write'),validator,validationCollection,universalController.create);
universalRouter.put("/:id",tokenauth    ,authorizeCheck('update'),validator,validationCollection,universalController.update);
universalRouter.delete("/:id",tokenauth ,authorizeCheck('delete'),universalController.remove);



export default universalRouter
