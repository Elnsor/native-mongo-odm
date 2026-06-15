import express from "express"
import { BaseController } from "../framework/BaseController.js";


const router=express.Router();

const userController= new BaseController("users");

router.get("/",userController.findAll)
router.post("/",userController.create)
router.get("/:id",userController.findById);
router.put("/:id",userController.update);
router.delete("/:id",userController.remove);





export {router as userRouter};