import { getMonitoringHealthStatus } from "../Monitor/monitoringSystem.js";

export const health= (req, res) => {
    const health = getMonitoringHealthStatus();
    res.json({
        success: true,
        data: health
    });
};

