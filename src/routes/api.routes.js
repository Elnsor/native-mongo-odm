import express from "express"
import universalRouter from "./universal.routes.js";
import loginRouter from "./api.login.routes.js";
import registerRouter from "./api.register.routes.js";
import metricsRouter from "./api.metrics.routes.js";
import healthRoutes from "./api.health.routes.js";


const apiRouter=express.Router();

apiRouter.get("/",async (req,res)=>{
    res.status(200).send("Welecome To My API ROUT 👽");
})

apiRouter.use("/login",loginRouter);
apiRouter.use("/register",registerRouter);
apiRouter.use("/health",healthRoutes);
apiRouter.use("/metrics",metricsRouter);



apiRouter.use("/:collectionName",universalRouter);


export default apiRouter