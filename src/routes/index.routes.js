import express from  "express"
import { userRouter } from "./userRouter.js"
import apiRouter from "./api.routes.js";

const indexRout=express.Router();

indexRout.get("/",async (req,res)=>{
    res.status(200).send("Welecome To My Moduler Server API 🏋️");
})

indexRout.use("/api",apiRouter);
//indexRout.use("/users",userRouter);

export {indexRout as indexRouter}