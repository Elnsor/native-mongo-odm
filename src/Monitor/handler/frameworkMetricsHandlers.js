// src/Monitoring/handlers/frameworkMetricsHandlers.js

import { getMonitoring } from '../monitoringSystem.js';
import { EVENT_TYPES, EVENT_MTYPES, DOMAIN } from '../constant/eventType.js';
import { METRIC_NAMES } from '../constant/metricsName.js';

/**
 * register metrics handler 
 */
export function registerFrameworkMetricsHandlers() {
    const monitoring = getMonitoring();

    // ==========================================
    // Schema Validation Handlers
    // ==========================================
    monitoring.registerHandler(EVENT_TYPES.SCHEMA_VALIDATE_START, EVENT_MTYPES.METRIC_C, (data, collector) => {
        collector.increment(METRIC_NAMES.SCHEMA_VALIDATION_TOTAL, 1);
    });

    monitoring.registerHandler(EVENT_TYPES.SCHEMA_VALIDATE_END, EVENT_MTYPES.METRIC_H, (data, collector) => {
        collector.observeHistogram(METRIC_NAMES.SCHEMA_VALIDATION_DURATION, data.v1, {}, 'ns');
    });

    monitoring.registerHandler(EVENT_TYPES.SCHEMA_VALIDATE_ERROR, EVENT_MTYPES.METRIC_C, (data, collector) => {
        collector.increment(METRIC_NAMES.SCHEMA_VALIDATION_ERRORS, 1);
    });

    // ==========================================
    // Security Rules Engine Handlers
    // ==========================================
    monitoring.registerHandler(EVENT_TYPES.SECURITY_EVAL_START, EVENT_MTYPES.METRIC_C, (data, collector) => {
        collector.increment(METRIC_NAMES.SECURITY_EVAL_TOTAL, 1 );
    });

    monitoring.registerHandler(EVENT_TYPES.SECURITY_EVAL_END, EVENT_MTYPES.METRIC_H, (data, collector) => {
        collector.observeHistogram(METRIC_NAMES.SECURITY_EVAL_DURATION, data.v1, {}, 'ns');
    });

    monitoring.registerHandler(EVENT_TYPES.SECURITY_RULE_BLOCKED, EVENT_MTYPES.METRIC_C, (data, collector) => {
        collector.increment(METRIC_NAMES.SECURITY_RULE_BLOCKED, 1);
    });

    monitoring.registerHandler(EVENT_TYPES.SECURITY_SYSTEM_INJECT, EVENT_MTYPES.METRIC_C, (data, collector) => {
        collector.increment(METRIC_NAMES.SECURITY_SYSTEM_INJECTED, 1);
    });

    // ==========================================
    // Auth Token Handlers
    // ==========================================
    monitoring.registerHandler(EVENT_TYPES.AUTH_TOKEN_VERIFY_START, EVENT_MTYPES.METRIC_C, (data, collector) => {
        collector.increment(METRIC_NAMES.AUTH_TOKEN_VERIFY_TOTAL);
    });

    monitoring.registerHandler(EVENT_TYPES.AUTH_TOKEN_VERIFY_END, EVENT_MTYPES.METRIC_H, (data, collector) => {
        collector.observeHistogram(METRIC_NAMES.AUTH_TOKEN_VERIFY_DURATION, data.v1, {}, 'ns');
    });

    monitoring.registerHandler(EVENT_TYPES.AUTH_TOKEN_VERIFY_FAILED, EVENT_MTYPES.METRIC_C, (data, collector) => {
        collector.increment(METRIC_NAMES.AUTH_TOKEN_VERIFY_FAILED, 1);
    });

    // ==========================================
    // CRUD Operations Handlers
    // ==========================================
    monitoring.registerHandler(EVENT_TYPES.CRUD_CREATE_END, EVENT_MTYPES.METRIC_H, (data, collector) => {
        collector.increment(METRIC_NAMES.CRUD_OPERATIONS_TOTAL, 1, { 
            operation: 'create', 
            
        });
        collector.increment(METRIC_NAMES.CRUD_CREATE_TOTAL, 1 );
        collector.observeHistogram(METRIC_NAMES.CRUD_OPERATION_DURATION, data.v1, { 
            operation: 'create', 
        }, 'ns');
    });

    monitoring.registerHandler(EVENT_TYPES.CRUD_UPDATE_END, EVENT_MTYPES.METRIC_H, (data, collector) => {
        collector.increment(METRIC_NAMES.CRUD_OPERATIONS_TOTAL, 1, { 
            operation: 'update', 

        });
        collector.increment(METRIC_NAMES.CRUD_UPDATE_TOTAL, 1);
        collector.observeHistogram(METRIC_NAMES.CRUD_OPERATION_DURATION, data.v1, { 
            operation: 'update', 
            
        }, 'ns');
    });

    monitoring.registerHandler(EVENT_TYPES.CRUD_DELETE_END, EVENT_MTYPES.METRIC_H, (data, collector) => {
        collector.increment(METRIC_NAMES.CRUD_OPERATIONS_TOTAL, 1, { 
            operation: 'delete', 
            
        });
        collector.increment(METRIC_NAMES.CRUD_DELETE_TOTAL, 1);
        collector.observeHistogram(METRIC_NAMES.CRUD_OPERATION_DURATION, data.v1, { 
            operation: 'delete', 
        }, 'ns');
    });

    monitoring.registerHandler(EVENT_TYPES.CRUD_OPERATION_ERROR, EVENT_MTYPES.METRIC_C, (data, collector) => {
        collector.increment(METRIC_NAMES.CRUD_OPERATIONS_ERROR, 1);
    });

    monitoring.registerHandler(EVENT_TYPES.CRUD_BATCH_START,EVENT_MTYPES.METRIC_C,(data, collector)=>{
        collector.increment(METRIC_NAMES.CRUD_BATCH_TOTAL, 1);
    })

    monitoring.registerHandler(EVENT_TYPES.CRUD_BATCH_END, EVENT_MTYPES.METRIC_H, (data, collector) => {
        
        collector.observeHistogram(METRIC_NAMES.CRUD_BATCH_DURATION, data.v1, {}, 'ns');
    });

    // ==========================================
    // Database Operations Handlers
    // ==========================================
    monitoring.registerHandler(EVENT_TYPES.DB_QUERY_END, EVENT_MTYPES.METRIC_H, (data, collector) => {
        
        collector.observeHistogram(METRIC_NAMES.DB_QUERY_DURATION, data.v1, { 
            operation: data.v2 || 'unknown' 
        }, 'ns');
    });
    monitoring.registerHandler(EVENT_TYPES.DB_QUERY_START,EVENT_MTYPES.METRIC_C,(data,collector) => {
        collector.increment(METRIC_NAMES.DB_QUERY_TOTAL, 1 );

    });

    monitoring.registerHandler(EVENT_TYPES.DB_TRANSACTION_COMMIT, EVENT_MTYPES.METRIC_C, (data, collector) => {
        collector.increment(METRIC_NAMES.DB_TRANSACTION_COMMIT);
    });

    monitoring.registerHandler(EVENT_TYPES.DB_TRANSACTION_ABORT, EVENT_MTYPES.METRIC_C, (data, collector) => {
        collector.increment(METRIC_NAMES.DB_TRANSACTION_ABORT);
    });

    console.log('✅ Framework Core Metrics Handlers Registered Successfully');
}