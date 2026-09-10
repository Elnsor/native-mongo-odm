

/**
 * @typedef {keyof typeof EVENT_TYPES} EventType 
 */
export const EVENT_TYPES = {
    // ==========================================
    // RBAC Domain Events (1 - 99)
    // ==========================================
    
    // 1. Access & Authorization (1-19)
    RBAC_AUTH_CHECK: 1,           // عملية checkAccess
    RBAC_AUTH_DENIED: 2,          // رفض الوصول
    RBAC_AUTH_EXPIRED: 3,         // صلاحية منتهية
    RBAC_AUTH_GRANTED: 4,         // منح الوصول
    RBAC_AUTH_WILDCARD: 5,        // استخدام wildcard fallback
    
    // 2. Compilation & Validation (20-39)
    RBAC_COMPILE_START: 20,       // بداية التجميع
    RBAC_COMPILE_END: 21,         // نهاية التجميع
    RBAC_COMPILE_ERROR: 22,       // خطأ في التجميع
    RBAC_VALIDATION_START: 23,    // بداية التحقق
    RBAC_VALIDATION_END: 24,      // نهاية التحقق
    
    // 3. Buffer & Memory (40-59)
    RBAC_BUFFER_CREATED: 40,      // إنشاء buffer
    RBAC_BUFFER_OVERFLOW: 41,     // تجاوز السعة
    RBAC_BUFFER_SIZE: 42,      // تغيير الحجم
    
    // 4. Role Lifecycle (60-79)
    RBAC_ROLE_REGISTERED: 60,     // تسجيل دور (Class)
    RBAC_ROLE_INSTANTIATED: 61,   // إنشاء instance
    RBAC_ROLE_HOT_SWAP: 62,       // hot-swap (تحديث ذري)
    RBAC_ROLE_REMOVED: 63,        // إزالة دور
    RBAC_ROLE_EXPIRED: 64,        // دور منتهي الصلاحية
    RBAC_ROLE_CREATED:65,
    RBAC_ROLE_ACTIVE: 66,
    
    // 5. Resource Management (80-89)
    RBAC_RESOURCE_ADDED: 80,      // إضافة مورد جديد
    RBAC_INSTANCE_ADDED: 81,      // إضافة instance
    RBAC_MEMBER_ADDED: 82,        // إضافة عضو لدور
    
    // 6. System Maintenance (90-99)
    RBAC_FLUSH_START: 90,         // بداية معالجة المنتهية
    RBAC_FLUSH_END: 91            // نهاية معالجة المنتهية
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