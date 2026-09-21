/**
 METRIC_NAMES: [domain].[operation].[type]     → dot.notation

 */
/**
 * @typedef {keyof typeof METRIC_NAMES} MetricsName
 */

export const METRIC_NAMES = {
    // ==========================================
    // Access & Authorization Metrics
    // ==========================================
    // Counter + Histogram
    RBAC_CHECK_TOTAL: "rbac.access.check.total",           // counter
    RBAC_CHECK_DURATION: "rbac.access.check.duration",     // histogram
    RBAC_CHECK_DENIED: "rbac.access.check.denied",         // counter
    RBAC_CHECK_GRANTED: "rbac.access.check.granted",       // counter
    RBAC_CHECK_EXPIRED: "rbac.access.check.expired",       // counter
    RBAC_CHECK_WILDCARD: "rbac.access.check.wildcard",     // counter
    RBAC_CHECK_DEPTH: "rbac.check_access.depth" ,           //Histogram
    // ==========================================
    // Compilation Metrics
    // ==========================================
    // Counter + Histogram
    RBAC_COMPILE_COUNT_S: "rbac.compiler.compile.count.s",     // counter
    RBAC_COMPILE_COUNT_E: "rbac.compiler.compile.count.e",     // counter
    RBAC_COMPILE_DURATION: "rbac.compiler.compile.duration", // histogram
    RBAC_COMPILE_ERRORS: "rbac.compiler.compile.errors",   // counter
    RBAC_COMPILE_LAST_TIME: "rbac.compiler.compile.last_time", // gauge
    RBAC_COMPILE_VALIDATION_S: "rbac.compiler.validation.count.s",     // counter
    RBAC_COMPILE_VALIDATION_E: "rbac.compiler.validation.count.e", // counter 
    RBAC_COMPILE_VALIDATION_DURATION: 'rbac.compiler.validation.duration' ,    // hist
    
    // ==========================================
    // Buffer & Memory Metrics
    // ==========================================
    // Gauge + Counter
    RBAC_BUFFER_COUNT: "rbac.buffer.total", 
    RBAC_BUFFER_SIZE_TOTAL: "rbac.buffer.size.total.byte",      // hist (elements)
    RBAC_BUFFER_SIZE: "rbac.buffer.size",                  // gauge (elements)
    RBAC_BUFFER_BYTES: "rbac.buffer.bytes",                // gauge (bytes)
    RBAC_BUFFER_OVERFLOW: "rbac.buffer.overflow",          // counter
    RBAC_BUFFER_RESIZE: "rbac.buffer.resize",              // counter
    
    // ==========================================
    // Role Lifecycle Metrics
    // ==========================================
    // Counter + Gauge
    RBAC_ROLE_REGISTERED: "rbac.roles.registered",         // counter
    RBAC_ROLE_INSTANTIATED: "rbac.roles.instantiated",     // counter
    RBAC_ROLE_HOT_SWAP: "rbac.roles.hot_swap",             // counter
    RBAC_ROLE_REMOVED: "rbac.roles.removed",               // counter
    RBAC_ROLE_EXPIRED: "rbac.roles.expired",               // counter
    RBAC_ROLE_ACTIVE: "rbac.roles.active",                 // gauge (current count)
    RBAC_ROLE_HOT_SWAP_SIZE: "rbac.roles.hot_swap.size",   // histogram (buffer size)
    
    // ==========================================
    // Resource Management Metrics
    // ==========================================
    // Counter + Gauge
    RBAC_RESOURCE_ADDED: "rbac.resources.added",           // counter
    RBAC_INSTANCE_ADDED: "rbac.instances.added",           // counter
    RBAC_MEMBER_ADDED: "rbac.members.added",               // counter
    RBAC_RESOURCES_TOTAL: "rbac.resources.total",          // gauge
    RBAC_INSTANCES_TOTAL: "rbac.instances.total",          // gauge
    
    // ==========================================
    // System Maintenance Metrics
    // ==========================================
    // Counter + Histogram + Gauge
    RBAC_FLUSH_COUNT: "rbac.system.flush.count",           // counter
    RBAC_FLUSH_DURATION: "rbac.system.flush.duration",     // histogram
    RBAC_FLUSH_QUEUE_SIZE: "rbac.system.flush.queue_size",  // gauge (expired bucket size)



      // ==========================================
    // Framework Core: Schema Validation Metrics
    // ==========================================
    SCHEMA_VALIDATION_TOTAL: "framework.schema.validation.total",
    SCHEMA_VALIDATION_DURATION: "framework.schema.validation.duration",
    SCHEMA_VALIDATION_ERRORS: "framework.schema.validation.errors",

    // ==========================================
    // Framework Core: Security Rules Metrics
    // ==========================================
    SECURITY_EVAL_TOTAL: "framework.security.eval.total",
    SECURITY_EVAL_DURATION: "framework.security.eval.duration",
    SECURITY_RULE_BLOCKED: "framework.security.rule.blocked",
    SECURITY_SYSTEM_INJECT_TOTAL: "framework.security.system.inject.total",

    // ==========================================
    // Framework Core: Auth Token Metrics
    // ==========================================
    AUTH_TOKEN_VERIFY_TOTAL: "framework.auth.token.verify.total",
    AUTH_TOKEN_VERIFY_FAILED: "framework.auth.token.verify.failed",
    AUTH_TOKEN_VERIFY_DURATION: "framework.auth.token.verify.duration",

    // ==========================================
    // Framework Core: CRUD Operations Metrics
    // ==========================================
    CRUD_OPERATIONS_TOTAL: "framework.crud.operations.total",
    CRUD_OPERATION_DURATION: "framework.crud.operation.duration",
    CRUD_OPERATIONS_ERROR: "framework.crud.operations.errors",
    CRUD_CREATE_TOTAL: "framework.crud.create.total",
    CRUD_UPDATE_TOTAL: "framework.crud.update.total",
    CRUD_DELETE_TOTAL: "framework.crud.delete.total",
    CRUD_BATCH_TOTAL: "framework.crud.batch.total",
    CRUD_BATCH_DURATION: "framework.crud.batch.duration",

    // ==========================================
    // Framework Core: Database Operations Metrics
    // ==========================================
    DB_QUERY_TOTAL: "framework.db.query.total",
    DB_QUERY_DURATION: "framework.db.query.duration",
    DB_TRANSACTION_TOTAL: "framework.db.transaction.total",
    DB_TRANSACTION_COMMIT: "framework.db.transaction.commit",
    DB_TRANSACTION_ABORT: "framework.db.transaction.abort"
};

