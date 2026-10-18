import pino from "pino";

const isDev=process.env.NODE_DEV !== 'production';
export const logger=pino({
    timestamp: pino.stdTimeFunctions,
    level: process.env.LOG_LEVLE || (isDev?'debug':"info"),
    base:{
        service: "custom-odm-app",
        pid:process.pid,
        env:process.env.NODE_DEV || 'development',
    },
      // Redact sensitive fields so they NEVER appear in logs
    redact: {
        paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'password',
            'secret',
            'token',
            '*.password',
            '*.secret',
        ],
        censor: '[REDACTED]',
    },
    // pretty 
    transport:isDev?
    {
        target: 'pino-pretty',
        options:{
            collorize:true,
            translateTime: 'SYS:HH:MM:ss.l ',
            ignore: 'pid,hostname'
        }
    }  
    : undefined

});

/**
 * Create a child logger scoped to a specific module.
 * Usage: const log = childLogger('auth');
 *        log.info({ userId: 123 }, 'User logged in');
 *
 * @param {string} module - Module name (e.g., 'auth', 'rbac', 'db')
 * @returns {pino.Logger}
 */
export function childLogger(module) {
    return logger.child({ module });
}