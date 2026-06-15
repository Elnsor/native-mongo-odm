import express from "express"
import universalRouter from "./universal.routes.js";

const apiRouter=express.Router();

apiRouter.get("/",async (req,res)=>{
    res.status(200).send("Welecome To My API ROUT 👽");
})

apiRouter.use("/:collectionName",universalRouter);


export default apiRouter