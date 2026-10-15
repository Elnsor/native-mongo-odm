// src/Monitoring/handlers/frameworkMetricsHandlers.js

import { getMonitoring } from '../Monitor/monitoringSystem.js';
import { EVENT_TYPES, EVENT_MTYPES, DOMAIN } from '../Monitor/constant/eventType.js';
import { METRIC_NAMES } from '../Monitor/constant/metricsName.js';
import { dbAppIns } from '../dpApp.js';

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
        collector.increment(METRIC_NAMES.SECURITY_SYSTEM_INJECT_TOTAL, 1);
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
        
        collector.observeHistogram(METRIC_NAMES.CRUD_OPERATION_DURATION, data.v1, { 
            operation: 'create', 
        }, 'ns');
    });

    monitoring.registerHandler(EVENT_TYPES.CRUD_CREATE_START, EVENT_MTYPES.METRIC_C, (data, collector) => {
        collector.increment(METRIC_NAMES.CRUD_OPERATIONS_TOTAL, 1, { 
            operation: 'create', 
            
        });
        collector.increment(METRIC_NAMES.CRUD_CREATE_TOTAL, 1 );
        
    });

    monitoring.registerHandler(EVENT_TYPES.CRUD_UPDATE_END, EVENT_MTYPES.METRIC_H, (data, collector) => {

        collector.observeHistogram(METRIC_NAMES.CRUD_OPERATION_DURATION, data.v1, { 
            operation: 'update', 
            
        }, 'ns');
    });
    monitoring.registerHandler(EVENT_TYPES.CRUD_UPDATE_START, EVENT_MTYPES.METRIC_C, (data, collector) => {
        collector.increment(METRIC_NAMES.CRUD_OPERATIONS_TOTAL, 1, { 
            operation: 'update', 
        });
        collector.increment(METRIC_NAMES.CRUD_UPDATE_TOTAL, 1);
        
    });

    monitoring.registerHandler(EVENT_TYPES.CRUD_DELETE_END, EVENT_MTYPES.METRIC_H, (data, collector) => {
        
        collector.observeHistogram(METRIC_NAMES.CRUD_OPERATION_DURATION, data.v1, { 
            operation: 'delete', 
        }, 'ns');
        
    });

    monitoring.registerHandler(EVENT_TYPES.CRUD_DELETE_START, EVENT_MTYPES.METRIC_C, (data, collector) => {
        collector.increment(METRIC_NAMES.CRUD_OPERATIONS_TOTAL, 1, { 
            operation: 'delete', 
            
        });
        collector.increment(METRIC_NAMES.CRUD_DELETE_TOTAL, 1);
        
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

    /**
     * RBAC_AUTH_CHECK - Fired on every checkAccess() call
     * @data.v1 {number} Duration in microseconds
     * @metrics Counter + Histogram
     */
  
    monitoring.registerHandler(EVENT_TYPES.RBAC_AUTH_CHECK, EVENT_MTYPES.METRIC_C, (data, collector) => {
        
  
        collector.increment(METRIC_NAMES.RBAC_CHECK_TOTAL);
      
    });
    monitoring.registerHandler(EVENT_TYPES.RBAC_AUTH_CHECK,EVENT_MTYPES.METRIC_H, (data, collector) => {
     
        collector.observeHistogram(METRIC_NAMES.RBAC_CHECK_DURATION, data.v1,{},"ns");
    });

    /**
     * RBAC_AUTH_DENIED - Fired when access is denied (role not found, etc.)
     * @data.v1 {number} GroupRoleId that was denied
     * @metrics Counter
     */
    monitoring.registerHandler(EVENT_TYPES.RBAC_AUTH_DENIED,EVENT_MTYPES.METRIC_C, (data, collector) => {
        collector.increment(METRIC_NAMES.RBAC_CHECK_DENIED,data.v1);
    });

    /**
     * RBAC_AUTH_EXPIRED - Fired when a permission has expired (TTL reached)
     * @data.v1 {number} GroupRoleId with expired permission
     * @metrics Counter
     */
    monitoring.registerHandler(EVENT_TYPES.RBAC_AUTH_EXPIRED, EVENT_MTYPES.METRIC_C, (data, collector) => {
        collector.increment(METRIC_NAMES.RBAC_CHECK_EXPIRED);
    });

    /**
     * RBAC_AUTH_GRANTED - Fired when access is successfully granted
     * @data.v1 {number} GroupRoleId that was granted
     * @metrics Counter
     */
    monitoring.registerHandler(EVENT_TYPES.RBAC_AUTH_GRANTED, EVENT_MTYPES.METRIC_C, (data, collector) => {
        collector.increment(METRIC_NAMES.RBAC_CHECK_GRANTED);
    });

    /**
     * RBAC_AUTH_WILDCARD - Fired when wildcard fallback is used
     * @data.v1 {number} GroupRoleId using wildcard
     * @metrics Counter
     */
    monitoring.registerHandler(EVENT_TYPES.RBAC_AUTH_WILDCARD, EVENT_MTYPES.METRIC_C, (data, collector) => {
        collector.increment(METRIC_NAMES.RBAC_CHECK_WILDCARD);
    });

    // ========================================================================
    // 2. COMPILATION & VALIDATION EVENTS (20-39)
    // ========================================================================
    
    /**
     * RBAC_COMPILE_START - Fired at the beginning of compile()
     * @data.v1 {number} Reserved (currently 0)
     * @metrics Counter
     */
    monitoring.registerHandler(EVENT_TYPES.RBAC_COMPILE_START, EVENT_MTYPES.METRIC_C, (data, collector) => {
        collector.increment(METRIC_NAMES.RBAC_COMPILE_COUNT_S);
    });

    /**
     * RBAC_COMPILE_END - Fired at the end of successful compile()
     * @data.v1 {number} Duration in microseconds
     * @metrics Counter + Gauge + Histogram
     */
    monitoring.registerHandler(EVENT_TYPES.RBAC_COMPILE_END, EVENT_MTYPES.METRIC_C, (data, collector) => {
        collector.increment(METRIC_NAMES.RBAC_COMPILE_COUNT_E);
       
       
    });

     monitoring.registerHandler(EVENT_TYPES.RBAC_COMPILE_END,EVENT_MTYPES.METRIC_G, (data, collector) => {
       
        collector.setGauge(METRIC_NAMES.RBAC_COMPILE_LAST_TIME, data.v1);
       
    });

     monitoring.registerHandler(EVENT_TYPES.RBAC_COMPILE_END,EVENT_MTYPES.METRIC_H, (data, collector) => {
       
       
        collector.observeHistogram(METRIC_NAMES.RBAC_COMPILE_DURATION, data.v1,{},'ns');
    });

    /**
     * RBAC_COMPILE_ERROR - Fired when compile() throws an error
     * @data.v1 {number} Error code or 500 for generic errors
     * @metrics Counter
     */
    monitoring.registerHandler(EVENT_TYPES.RBAC_COMPILE_ERROR, EVENT_MTYPES.METRIC_C,(data, collector) => {
        collector.increment(METRIC_NAMES.RBAC_COMPILE_ERRORS);
    });

    /**
     * RBAC_VALIDATION_START - Fired at the beginning of validation phase
     * @data.v1 {number} Reserved
     * @metrics Counter (optional - can be removed if validation is fast)
     */
    monitoring.registerHandler(EVENT_TYPES.RBAC_VALIDATION_START, EVENT_MTYPES.METRIC_C,(data, collector) => {
        collector.increment(METRIC_NAMES.RBAC_COMPILE_VALIDATION_S);
    });

    /**
     * RBAC_VALIDATION_END - Fired at the end of validation phase
     * @data.v1 {number} Duration in microseconds
     * @metrics Histogram
     */
    monitoring.registerHandler(EVENT_TYPES.RBAC_VALIDATION_END, EVENT_MTYPES.METRIC_H , (data, collector) => {
        collector.observeHistogram(METRIC_NAMES.RBAC_COMPILE_VALIDATION_DURATION, data.v1,{},'ns');
    });

    // ========================================================================
    // 3. BUFFER & MEMORY EVENTS (40-59)
    // ========================================================================
    
    /**
     * RBAC_BUFFER_CREATED - Fired when a new RoleBinaryWorker is created
     * @data.v1 {number} Buffer length (number of elements)
     * @data.v2 {number} Total size in bytes
     * @metrics Gauge (2 metrics)
     */
    monitoring.registerHandler(EVENT_TYPES.RBAC_BUFFER_CREATED,EVENT_MTYPES.METRIC_C, (data, collector) => {

         collector.increment(METRIC_NAMES.RBAC_BUFFER_COUNT);

      
    });
    monitoring.registerHandler(EVENT_TYPES.RBAC_BUFFER_SIZE,EVENT_MTYPES.METRIC_H, (data, collector) => {

         collector.observeHistogram(METRIC_NAMES.RBAC_BUFFER_SIZE_TOTAL, data.v1,{},'byte');
    });

    /**
     * RBAC_BUFFER_OVERFLOW - Fired when buffer exceeds capacity
     * @data.v1 {number} Reserved
     * @metrics Counter
     */
    monitoring.registerHandler(EVENT_TYPES.RBAC_BUFFER_OVERFLOW,EVENT_MTYPES.METRIC_C, (data, collector) => {
        collector.increment(METRIC_NAMES.RBAC_BUFFER_OVERFLOW);
    });

   
    // ========================================================================
    // 4. ROLE LIFECYCLE EVENTS (60-79)
    // ========================================================================
    
    /**
     * RBAC_ROLE_REGISTERED - Fired when a role class is registered
     * @data.v1 {number} GroupRoleId
     * @metrics Counter + Gauge
     */
    monitoring.registerHandler(EVENT_TYPES.RBAC_ROLE_REGISTERED, EVENT_MTYPES.METRIC_C,(data, collector) => {
        collector.increment(METRIC_NAMES.RBAC_ROLE_REGISTERED);
        // Note: Gauge update requires access to RoleBaseBuckets.insBucket.size
        // This should be done in the calling code, not here
    });

    /**
     * RBAC_ROLE_INSTANTIATED - Fired when a role instance is created
     * @data.v1 {number} GroupRoleId
     * @metrics Counter + Gauge
     */
    monitoring.registerHandler(EVENT_TYPES.RBAC_ROLE_INSTANTIATED, EVENT_MTYPES.METRIC_C,(data, collector) => {
        collector.increment(METRIC_NAMES.RBAC_ROLE_INSTANTIATED);
    });

    /**
     * RBAC_ROLE_HOT_SWAP - Fired when a role is atomically updated
     * @data.v1 {number} New buffer size
     * @metrics Counter + Histogram
     */
    monitoring.registerHandler(EVENT_TYPES.RBAC_ROLE_HOT_SWAP,EVENT_MTYPES.METRIC_C, (data, collector) => {
        collector.increment(METRIC_NAMES.RBAC_ROLE_HOT_SWAP);
        
    });
    monitoring.registerHandler(EVENT_TYPES.RBAC_ROLE_HOT_SWAP,EVENT_MTYPES.METRIC_H,(data,collector) => {
        collector.observeHistogram(METRIC_NAMES.RBAC_ROLE_HOT_SWAP_SIZE, data.v1,{},'ns');
    })

    /**
     * RBAC_ROLE_REMOVED - Fired when a role is removed from the system
     * @data.v1 {number} GroupRoleId
     * @metrics Counter
     */
    monitoring.registerHandler(EVENT_TYPES.RBAC_ROLE_REMOVED, EVENT_MTYPES.METRIC_C,(data, collector) => {
        collector.increment(METRIC_NAMES.RBAC_ROLE_REMOVED);
    });

    /**
     * RBAC_ROLE_EXPIRED - Fired when a role member's permission expires
     * @data.v1 {number} GroupRoleId
     * @metrics Counter
     */
    monitoring.registerHandler(EVENT_TYPES.RBAC_ROLE_EXPIRED,EVENT_MTYPES.METRIC_C, (data, collector) => {
        collector.increment(METRIC_NAMES.RBAC_ROLE_EXPIRED);
    });

    // ========================================================================
    // 5. RESOURCE MANAGEMENT EVENTS (80-89)
    // ========================================================================
    
    /**
     * RBAC_RESOURCE_ADDED - Fired when a new resource type is added
     * @data.v1 {number} Resource PID
     * @metrics Counter
     */
    monitoring.registerHandler(EVENT_TYPES.RBAC_RESOURCE_ADDED, EVENT_MTYPES.METRIC_C,(data, collector) => {
        collector.increment(METRIC_NAMES.RBAC_RESOURCE_ADDED);
    });

    /**
     * RBAC_INSTANCE_ADDED - Fired when a new resource instance is added
     * @data.v1 {number} Resource PID
     * @data.v2 {number} Instance index
     * @metrics Counter
     */
    monitoring.registerHandler(EVENT_TYPES.RBAC_INSTANCE_ADDED, EVENT_MTYPES.METRIC_C,(data, collector) => {
        collector.increment(METRIC_NAMES.RBAC_INSTANCE_ADDED);
    });

    /**
     * RBAC_MEMBER_ADDED - Fired when a new member is added to a role
     * @data.v1 {number} GroupRoleId
     * @data.v2 {number} MemberId
     * @metrics Counter
     */
    monitoring.registerHandler(EVENT_TYPES.RBAC_MEMBER_ADDED, (data, collector) => {
        collector.increment(METRIC_NAMES.RBAC_MEMBER_ADDED);
    });

    // ========================================================================
    // 6. SYSTEM MAINTENANCE EVENTS (90-99)
    // ========================================================================
    
    /**
     * RBAC_FLUSH_START - Fired when expired bucket flush begins
     * @data.v1 {number} Number of expired roles to process
     * @metrics Counter 
     */
    monitoring.registerHandler(EVENT_TYPES.RBAC_FLUSH_START,EVENT_MTYPES.METRIC_C, (data, collector) => {
        collector.increment(METRIC_NAMES.RBAC_FLUSH_COUNT);
     
    });

    /**
     * RBAC_FLUSH_START - Fired when expired bucket flush begins
     * @data.v1 {number} Number of expired roles to process
     * @metrics Gauge 
     */

    monitoring.registerHandler(EVENT_TYPES.RBAC_FLUSH_START,EVENT_MTYPES.METRIC_G, (data, collector) => {
        collector.setGauge(METRIC_NAMES.RBAC_FLUSH_QUEUE_SIZE, data.v1);
     
    });
   
    /**
     * RBAC_FLUSH_END - Fired when expired bucket flush completes
     * @data.v1 {number} Duration in microseconds
     * @metrics Histogram
     */
    monitoring.registerHandler(EVENT_TYPES.RBAC_FLUSH_END, EVENT_MTYPES.METRIC_H,(data, collector) => {
        collector.observeHistogram(METRIC_NAMES.RBAC_FLUSH_DURATION, data.v1,{},'ns');
    });


    console.log('Framework Core Metrics Handlers Registered Successfully');
}

dbAppIns.registerHandlerBefore(function (){
    if(dbAppIns.Config.monitoring.enabled){
     registerFrameworkMetricsHandlers();
    }
})