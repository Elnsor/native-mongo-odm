import express from 'express'
import { indexRouter } from './src/routes/index.routes.js'
import { globalErorrHnadler } from './src/middleware/errorHandler.js'


const app=express();

app.use(express.json());

app.use("/",indexRouter);

app.use(globalErorrHnadler);


export default app
