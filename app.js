import express from 'express'
import { indexRouter } from './src/routes/index.routes.js'
import { globalErorrHnadler } from './src/middleware/errorHandler.js'
import helmet from 'helmet'
import cors from 'cors'


const app=express();

app.use(helmet());
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

app.use("/",indexRouter);

app.use(globalErorrHnadler);


export default app
