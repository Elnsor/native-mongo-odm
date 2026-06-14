import express from "express"
import dotenv from "dotenv"
import { initUserModule } from "./src/modules/User.js";
import { connectDb } from "./src/config/db.js";
import { userRouter } from "./src/routes/userRouter.js";


dotenv.config();
const app=express();
app.use(express.json());
app.use("/users",userRouter);
const PORT=3000

async function bootstrab(){

    await connectDb();
    await initUserModule();
    app.listen(PORT,()=>{
        console.log(`🌐 Production Modular Server operational on http://localhost:${PORT}`);
    });
}
bootstrab();




