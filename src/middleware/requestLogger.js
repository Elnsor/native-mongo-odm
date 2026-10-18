import { childLogger } from '../utils/logger.js';
import { record } from '../Monitor/monitoringSystem.js';
import { EVENT_TYPES, EVENT_MTYPES, DOMAIN } from '../Monitor/constant/eventType.js';

const log = childLogger('http');

/**
 * Lightweight request/response logger.
 * Logs method, URL, status code, duration, and request ID.
 * Also feeds duration into your existing SystemMonitor histogram.
 */
export const requestLogger = (req, res, next) => {
    const start = performance.now();

    // Log when the response finishes
    res.on('finish', () => {
        const durationMs = performance.now() - start;
        const durationNs = durationMs * 1_000_000;

        // 1. Structured log via pino
        log.info(
            {
                requestId: req.requestId,
                method: req.method,
                url: req.originalUrl,
                statusCode: res.statusCode,
                durationMs: durationMs.toFixed(2),
                ip: req.ip,
                userAgent: req.headers['user-agent'],
            },
            `${req.method} ${req.originalUrl} → ${res.statusCode}`
        );

        // 2. Feed duration into your existing monitoring histogram
        // domain will be http domain but for now its odm_domain
        record(DOMAIN.ODM_DOMAIN, EVENT_TYPES.HTTP_REQUEST_END, EVENT_MTYPES.METRIC_H, durationNs);
    });

    next();
};