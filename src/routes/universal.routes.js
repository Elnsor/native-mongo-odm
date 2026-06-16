import express from "express"
import { BaseController } from "../framework/BaseController.js"
import   validator      from "../middleware/validate.js";


const universalRouter=express.Router({mergeParams:true});
const universalController=new BaseController();

universalRouter.get("/",universalController.findAll);
universalRouter.get("/:id",universalController.findById);
universalRouter.post("/",validator,universalController.create);
universalRouter.put("/:id",validator,universalController.update);
universalRouter.delete("/:id",universalController.remove);



export default universalRouter
