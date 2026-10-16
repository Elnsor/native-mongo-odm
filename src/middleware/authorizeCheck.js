import { AppError } from "../framework/appError.js";
import { rbacManager } from "../rbac/rbacManager.js";
import { DEFAULT_ACTIONS, BOUNDARY, TYPE_IDS,TYPE_IDS_NAME } from "../rbac/constant/resourceType.js";
import { resourceInstance } from "../rbac/buckets/systemReourcesInstances.js";


/**
 * @typedef {Object} AuthorizedOptions
 * @property {import ("../rbac/constant/typesDef.js").ResourcePid} parentTypePid - Parent Pid name (e.g., 100,200,...). Defaults to `.
 * @property {import ("../rbac/constant/typesDef.js").ResourcePid} childTypePid - Child Pid (e.g., 101,102,...).
 * @property {import ("../rbac/constant/typesDef.js").ResourcePid} grandChildTypePid - grand Child Pid .
 * @property {string} parentInsName - Parent resource instance name.
 * @property {string} childInsName - Child resource instance name.
 * @property {string} grandchildInsName - Grandchild resource instance name.
 * @property {string} [ownerFieldChecker='id'] - The name of the parameter holding owner checker.
 */
/**
 * Generic RBAC Authorization Middleware Factory
 * 
 * @param {keyof typeof DEFAULT_ACTIONS} action - The action to check (e.g., 'READ', 'WRITE', 'UPDATE', 'DELETE')
 * @param {AuthorizedOptions} options - Configuration options
  * @returns {Function} Express middleware
 */

export const authorizeCheck = (action, options = {}) => {
    //  OPTIMIZATION 1: Closure Optimization
    // Calculate actionBit ONCE when the middleware is defined, not on every request.
    const actionBit = DEFAULT_ACTIONS[action];
    if (!actionBit) {
        throw new Error(`Server Error: Unknown action '${action}' configured in middleware`);
    }

    return async (req, res, next) => {
        try {

             
           
            const user = req.user;
            if (!user || !user.accountInfo?.roleName) {
                return next(new AppError("Access Denied: User is not authenticated or role is missing", 401));
            }
          
            const userRolePid = resourceInstance.getRoleId(user.accountInfo.roleName);
         
            if (userRolePid?.code !== undefined  ) {
                return next(new AppError(`Access Denied: ${userRolePid.message}`, 403));
            }
           
            const parentPid = options.parentTypePid
            const childPid = options.childTypePid
            const grandPid = options.grandChildTypePid

           
            const parentInsId = options.parentInsName ? resourceInstance.getResourceInstanceIndex(TYPE_IDS_NAME[parentPid], options.parentInsName) : null;
            const childInsId =  resourceInstance.getResourceInstanceIndex(TYPE_IDS_NAME[childPid], options.childInsName) ;
            const grandInsId = grandPid ? resourceInstance.getResourceInstanceIndex(TYPE_IDS_NAME[grandPid], options.grandchildInsName) : null;
           
           
             if (parentInsId?.code !== undefined  ) {
                return next(new AppError(`Access Denied: ${parentInsId.message}`, 403));
            }
            if (childInsId?.code !== undefined  ) {
                return next(new AppError(`Access Denied: ${childInsId.message}`, 403));
            }
            if (grandPid && grandInsId?.code !== undefined  ) {
                return next(new AppError(`Access Denied: ${grandInsId.message}`, 403));
            }


            
            let resourceId = null;
          
                const ownerFieldName = options.ownerFildChecker || 'id';
                resourceId = req.params[ownerFieldName] || req.body[ownerFieldName] || null;
           
 
            // 6. Check Access via RBAC Manager (Highly optimized bitwise ops inside)
            const access = rbacManager.checkAccess(
                userRolePid,
                parentPid,
                parentInsId, 
                childPid,
                childInsId,
                grandPid,
                grandInsId
            );

            // If access is fundamentally denied at the role level
            if (typeof access === 'object' && access.code) {
             
              
                return next(new AppError(`Access Denied: ${access.message}`, 403));
            }

            // 7. Check Action Permission
            const isPrimaryAllowed = rbacManager.allowedOwnerAction(access, actionBit);
            const isOthersAllowed = rbacManager.allowedOtherAction(access, actionBit);
            const othersBoundary = rbacManager.getOtherBoundary(access);
            const primaryBoundary = rbacManager.getOwnerBoundary(access);

           // Note: For GET/PUT/DELETE, the controller might have already fetched the doc. 
                // If not, we assume the middleware is used after a data-fetching middleware, 
                // or we check against req.body/params. For strictness, we check req.body o 
           

            // 8. Check Boundaries (OWN vs ALL)
            let isOwner=false;
            if (resourceId !== null) {
                const ownerId = user[options.ownerFildChecker]
                isOwner = String(resourceId) === String(ownerId);


            }

         

            if(isOwner){
                if(!isPrimaryAllowed)  return next(new AppError(`Access Denied: Role does not have '${action}' permission on '${parentPid}'`, 403));
                return next();
             
            }else if(resourceId !== null &&  !isOwner){
                if((isPrimaryAllowed && primaryBoundary === BOUNDARY.ALL) || (isOthersAllowed && othersBoundary === BOUNDARY.ALL)) return next();
                if((isPrimaryAllowed && primaryBoundary === BOUNDARY.LIMITED) || (isOthersAllowed && othersBoundary === BOUNDARY.LIMITED)){
                     return next();
                }
                
                 return next(new AppError("Access Denied: You do not have permission to access other users' resources", 403));

            }
            if(resourceId === null){
                
                if((isPrimaryAllowed && primaryBoundary === BOUNDARY.LIMITED) || isOthersAllowed && othersBoundary === BOUNDARY.LIMITED){
                    return next();
                }
                
                if((isPrimaryAllowed && primaryBoundary === BOUNDARY.ALL) || (isOthersAllowed && othersBoundary === BOUNDARY.ALL)) return next();
                
                if(isPrimaryAllowed && primaryBoundary === BOUNDARY.OWN){
                         req.rbacScope = 'OWN';
                    req.rbacOwnerId = user._id || user.id;                    
                    return next();
                }
                

                 return next(new AppError("Access Denied: Insufficient permissions for this collection-level action", 403));



            }

            // Access granted
            next();
        } catch (error) {
            next(error);
        }
    };
};

