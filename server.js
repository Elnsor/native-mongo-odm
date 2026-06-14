import express from "express"
import dotenv from "dotenv"
import { initUserModule } from "./src/modules/User.js";
import { connectDb } from "./src/config/db.js";
import { indexRouter } from "./src/routes/index.routes.js";
import { collectionManager } from "./src/framework/CollectionManager.js";


dotenv.config();
const app=express();
app.use(express.json());

app.use("/",indexRouter);

const PORT=3000

async function bootstrap(){

    await connectDb();
    await collectionManager.dropCollection("users");
    await initUserModule();
    app.listen(PORT,()=>{
        console.log(`🌐 Production Modular Server operational on http://localhost:${PORT}`);
    });
}
bootstrap();




