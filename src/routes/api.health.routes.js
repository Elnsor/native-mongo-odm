
import express from 'express';
import { getMonitoringHealthStatus } from '../Monitor/monitoringSystem.js';
import { health } from '../controllers/health.controller.js';

const healthRoutes=express.Router()

healthRoutes.get('/',health);

export default healthRoutes;