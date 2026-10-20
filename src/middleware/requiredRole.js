// src/middleware/requireRole.js
import { AppError } from "../framework/appError.js";
import { resourceInstance } from "../rbac/buckets/systemReourcesInstances.js";

/**
 * Static Role Gate. 
 * Used ONLY for system-level routes that must never be altered via the RBAC dashboard.
 * 
 * @param {string|string[]} allowedRoleNames - e.g., 'SUPER_ADMIN' or ['ADMIN', 'SUPER_ADMIN']
 */
export const requireRole = (allowedRoleNames) => {
    // Normalize to array for easy checking
    const allowed = Array.isArray(allowedRoleNames) ? allowedRoleNames : [allowedRoleNames];

    return (req, res, next) => {
        const userRole = req.user?.accountInfo?.roleName;

        if (!userRole || !allowed.includes(userRole)) {
            return next(new AppError(
                `Access Denied: This system endpoint is strictly restricted to [${allowed.join(', ')}].`, 
                403
            ));
        }
        
        next();
    };
};