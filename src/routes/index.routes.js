import express from  "express"
import apiRouter from "./api.routes.js";
import { AppError } from "../framework/appError.js";

const indexRout=express.Router();

indexRout.get("/",async (req,res)=>{
    res.status(200).send("Welecome To My Moduler Server API 🏋️");
})

indexRout.use("/api",apiRouter);

indexRout.all(/.*/,(req,res,next)=>{

     next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));

})
export {indexRout as indexRouter}