import express from 'express'
import { indexRouter } from './src/routes/index.routes.js'
import { globalErrorHandler } from './src/middleware/errorHandler.js'
import helmet from 'helmet'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { requestLogger } from './src/middleware/requestLogger.js'


const app=express();

app.use(helmet());
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization','X-RequestId']
}));
app.use(express.json({limit : '100mb'}) )
app.use(express.urlencoded({extended:true,limit:'100mb'}));

// attach requestId for tracing 
app.use((req,res,next)=>{
    req.requestId =req.headers['x-request-id'] || crypto.randomUUID()
     console.log(req.requestId);
    res.setHeader('X-Request-Id',req.requestId)
   
    next();
});

// 1000 reqeat peer ip peer 15 min
const globalLimiter=rateLimit({
    windowMs:15*60*1000,
    max: 1000 ,
    standardHeaders: true,
    legacyHeaders:false ,
    message: {
        success: false,
        message: 'Too many requests, please try again later.',
    },

})
// Request logging (uses req.requestId)
app.use(requestLogger);
app.use(globalLimiter);

app.use("/",indexRouter);

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.method} ${req.originalUrl} not found`,
        requestId: req.requestId,
    });
});





app.use(globalErrorHandler);


export default app
