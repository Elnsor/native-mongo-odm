import { getDb } from '../config/db.js';

import { getMonitoringHealthStatus,getMonitoring } from '../Monitor/monitoringSystem.js';
import { RoleBaseBuckets } from '../rbac/buckets/buckets.js';
import { resourceInstance } from '../rbac/buckets/systemReourcesInstances.js';
import { childLogger } from '../utils/logger.js';

const log = childLogger('health');
/**
 * @type {import( '../Monitor/core/systemMonitor.js').SystemMonitor}
 */
const monitorApi=getMonitoring().monitor;

/**
 * Comprehensive health check endpoint.
 * Checks: MongoDB, RBAC engine, Monitoring system, Memory, Uptime.
 * 
 * GET /api/v1/health
 */
export const health = async (req, res) => {
    const checks = {};
    let overallHealthy = true;

    // ── 1. MongoDB Connectivity ──
    try {
        const dbStart = performance.now();
        const db = getDb();
        await db.admin().ping();
        const dbLatency = performance.now() - dbStart;

        checks.mongodb = {
            status: 'up',
            latencyMs: parseFloat(dbLatency.toFixed(2)),
        };
    } catch (err) {
        overallHealthy = false;
        checks.mongodb = {
            status: 'down',
            error: err.message,
        };
        log.error({ err: err.message }, 'MongoDB health check failed');
    }

    // ── 2. RBAC Engine ──
    try {
        const activeRoles = RoleBaseBuckets.insBucket.size;
        const totalRoles = resourceInstance.rolesCount;
        const totalResources = resourceInstance.totalResourcesCount;

        checks.rbac = {
            status: activeRoles > 0 ? 'up' : 'warning',
            activeRoles,
            totalRegisteredRoles: totalRoles,
            totalResourceInstances: totalResources,
        };

        if (activeRoles === 0) {
            overallHealthy = false;
            log.warn('RBAC has no active roles loaded');
        }
    } catch (err) {
        overallHealthy = false;
        checks.rbac = { status: 'down', error: err.message };
    }

    // ── 3. Monitoring System ──
    try {
      

        checks.monitoring = {
            status: monitorApi.getStats().droppedCount === 0 ? 'up' : 'degraded',
            queueSize:  monitorApi.getStats().queueSize,
            pendingEvents:  monitorApi.getStats().pendingEvent,
            droppedEvents:  monitorApi.getStats().droppedCount,
            eventsPerSecond: monitorApi.getStats().eventsPerSecond
        };

        if ( monitorApi.getStats().droppedCount > 0) {
            log.warn(
                { droppedCount:  monitorApi.getStats().droppedCount },
                'Monitoring ring buffer has dropped events'
            );
        }
    } catch (err) {
        checks.monitoring = { status: 'down', error: err.message };
    }

    // ── 4. Memory & Uptime ──
    const mem = process.memoryUsage();
    const uptimeSeconds = Math.floor(process.uptime());

    checks.memory = {
        rss: formatBytes(mem.rss),
        heapUsed: formatBytes(mem.heapUsed),
        heapTotal: formatBytes(mem.heapTotal),
        external: formatBytes(mem.external),
    };

    checks.uptime = {
        seconds: uptimeSeconds,
        human: formatUptime(uptimeSeconds),
    };

    // ── Response ──
    const statusCode = overallHealthy ? 200 : 503;

    res.status(statusCode).json({
        status: overallHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        checks,
    });
};

// ── Helpers ──
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${d}d ${h}h ${m}m ${s}s`;
}