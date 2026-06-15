import express from "express"
import { BaseController } from "../framework/BaseController.js"


const universalRouter=express.Router({mergeParams:true});
const universalController=new BaseController();

universalRouter.get("/",universalController.findAll);
universalRouter.get("/:id",universalController.findById);
universalRouter.post("/",universalController.create);
universalRouter.put("/:id",universalController.update);
universalRouter.delete("/:id",universalController.remove);



export default universalRouter
