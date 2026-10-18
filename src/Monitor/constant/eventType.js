

/**
 * @typedef {keyof typeof EVENT_TYPES} EventType 
 */
export const EVENT_TYPES = {

    
    // ==========================================
    // System  (1 - 9)
    // ==========================================

    SYSTEM_ERROR:1,
    // ==========================================
    // RBAC Domain Events (10 - 99)
    // ==========================================
    
    // 1. Access & Authorization (10-19)
    RBAC_AUTH_CHECK: 10,           
    RBAC_AUTH_DENIED: 11,          
    RBAC_AUTH_EXPIRED: 12,         
    RBAC_AUTH_GRANTED: 13,         
    RBAC_AUTH_WILDCARD: 14,        
    
    // 2. Compilation & Validation (20-39)
    RBAC_COMPILE_START: 20,       
    RBAC_COMPILE_END: 21,         
    RBAC_COMPILE_ERROR: 22,       
    RBAC_VALIDATION_START: 23,    
    RBAC_VALIDATION_END: 24,      
    
    // 3. Buffer & Memory (40-59)
    RBAC_BUFFER_CREATED: 40,      
    RBAC_BUFFER_OVERFLOW: 41,  
    RBAC_BUFFER_SIZE: 42,      
    
    // 4. Role Lifecycle (60-79)
    RBAC_ROLE_REGISTERED: 60,   
    RBAC_ROLE_INSTANTIATED: 61, 
    RBAC_ROLE_HOT_SWAP: 62,     
    RBAC_ROLE_REMOVED: 63,      
    RBAC_ROLE_EXPIRED: 64,      
    RBAC_ROLE_CREATED:65,
    RBAC_ROLE_ACTIVE: 66,
    
    // 5. Resource Management (80-89)
    RBAC_RESOURCE_ADDED: 80,    
    RBAC_INSTANCE_ADDED: 81,    
    RBAC_MEMBER_ADDED: 82,      
    
    // 6. System Maintenance (90-99)
    RBAC_FLUSH_START: 90,        
    RBAC_FLUSH_END: 91 ,         

     // ==========================================
    // Framework Core: Schema Validation (100 - 119)
    // ==========================================
    SCHEMA_VALIDATE_START: 100,
    SCHEMA_VALIDATE_END: 101,
    SCHEMA_VALIDATE_ERROR: 102,

    // ==========================================
    // Framework Core: Security Rules Engine (120 - 139)
    // ==========================================
    SECURITY_EVAL_START: 120,
    SECURITY_EVAL_END: 121,
    SECURITY_RULE_BLOCKED: 122, // e.g., immutable or restrictedRoles blocked it
    SECURITY_SYSTEM_INJECT:123, //eg couneter of field that are managed by system 

    // ==========================================
    // Framework Core: Auth Token (140 - 159)
    // ==========================================
    AUTH_TOKEN_VERIFY_START: 140,
    AUTH_TOKEN_VERIFY_END: 141,
    AUTH_TOKEN_VERIFY_FAILED: 142,

    // ==========================================
    // Framework Core: CRUD Operations (160 - 179)
    // ==========================================
    CRUD_CREATE_START: 160,
    CRUD_CREATE_END: 161,
    CRUD_UPDATE_START: 162,
    CRUD_UPDATE_END: 163,
    CRUD_DELETE_START: 164,
    CRUD_DELETE_END: 165,
    CRUD_OPERATION_ERROR: 166,
     CRUD_BATCH_START: 167,           
    CRUD_BATCH_END: 168,              

    // ==========================================
    // Framework Core: Database Operations (180 - 199)
    // ==========================================
    DB_QUERY_START: 180,              
    DB_QUERY_END: 181,                
    DB_TRANSACTION_START: 182,        
    DB_TRANSACTION_COMMIT: 183,       
    DB_TRANSACTION_ABORT: 184 ,
// ==========================================
    // Trafic And HTTP : Requests 200 - 299
    // ==========================================
    HTTP_REQUEST_RECIVES:200,
    HTTP_REQUEST_START : 202,
    HTTP_REQUEST_END : 202,
    
    HTTP_RESPONSE:210
};

export const EVENT_MTYPES={
    METRIC_C : 0,
    METRIC_G : 1,
    METRIC_H : 2,
}

export const DOMAIN={
    RBAC_DOMAIN: "rbac",
    ODM_DOMAIN:"odm"
}