
import express from 'express';
import { metrics } from '../controllers/metrics.controller.js';

const metricsRouter = express.Router();

//  Endpoint // show metrics 
metricsRouter.get('/',metrics);

export default metricsRouter;