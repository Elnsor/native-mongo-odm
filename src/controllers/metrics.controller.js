import { getMetricsSnapshot } from "../Monitor/monitoringSystem.js";

export const metrics= (req, res) => {
    const snapshot = getMetricsSnapshot();
    res.json({
        success: true,
        data: snapshot
    });
};


