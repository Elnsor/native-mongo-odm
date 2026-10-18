import { AppError } from '../framework/appError.js';
import { childLogger } from '../utils/logger.js';
import { record } from '../Monitor/monitoringSystem.js';
import { EVENT_TYPES, EVENT_MTYPES, DOMAIN } from '../Monitor/constant/eventType.js';

const log = childLogger('errors');

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Centralized error handler.
 * - Logs full error details server-side (via pino)
 * - Returns sanitized response to client (no stack traces in prod)
 * - Records error metrics via SystemMonitor
 */
export const globalErrorHandler = (err, req, res, next) => {
    // 1. Default values
    err.statusCode = err.statusCode || 500;
    err.status = err.status || (err.statusCode >= 500 ? 'error' : 'fail');

    // Log the FULL error server-side (always, regardless of env)
    log.error(
        {
            requestId: req.requestId,
            statusCode: err.statusCode,
            method: req.method,
            url: req.originalUrl,
            ip: req.ip,
            errorMessage: err.message,
            stack: err.stack,
            isOperational: err.isOperational,
        },
        `${err.statusCode} ${req.method} ${req.originalUrl}`
    );

    // Record error metric
    record(DOMAIN.ODM_DOMAIN, EVENT_TYPES.SYSTEM_ERROR, EVENT_MTYPES.METRIC_C);

    //  Handle specific MongoDB errors
    if (err.name === 'CastError') {
        err.statusCode = 400;
        err.message = `Invalid value for field '${err.path}': ${err.value}`;
    }
    if (err.code === 11000) {
        err.statusCode = 409;
        const field = Object.keys(err.keyValue || {}).join(', ');
        err.message = `Duplicate value for field(s): ${field}`;
    }
    if (err.name === 'ValidationError') {
        err.statusCode = 400;
        err.message = Object.values(err.errors).map(e => e.message).join('. ');
    }

    //  Build response
    const response = {
        success: false,
        status: err.status,
        statusCode: err.statusCode,
        message: err.message || 'Internal Server Error',
        requestId: req.requestId, // Helps correlate with server logs
    };

    //  Only include stack trace in development
    if (!isProduction) {
        response.stack = err.stack;
    }

    //  Hide internal error messages in production for 500 errors
    if (isProduction && err.statusCode >= 500 && !err.isOperational) {
        response.message = 'An unexpected error occurred. Please try again later.';
    }

    res.status(err.statusCode).json(response);
};