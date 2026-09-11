import { RoleBinaryWorker } from "../allocator/binary-worker.js";
import { SYSTEM_STATUS } from "./../constant/resourceType.js"
import {RoleBaseBuckets} from "./../buckets/buckets.js"
import { record ,auditLog } from "../../Monitor/monitoringSystem.js";
import { EVENT_TYPES,EVENT_MTYPES, DOMAIN } from "../../Monitor/constant/eventType.js";



export class AutherizationCheck {
    constructor() {
        this.registerdRoles = RoleBaseBuckets.insBucket;

    }

    getRole(GroupPid) {
        return this.registerdRoles.get(GroupPid);
    }
   
checkAccess(GroupRoleId, parentId, parentInstanceIndex, child = null, childInstanceIndex = null, grandChild = null, grandChildIndex = null){
  
  let parnetIns=parentInstanceIndex;
    

 
 let wildCard=false;
 let grandChildCompact= null;
 let childCompact= null;

 /** @type {RoleBinaryWorker} */
 const role = this.getRole(GroupRoleId);
          // if role id class not fount 
     if (!role) return  {code:SYSTEM_STATUS.ACCESS_DENIED,message: `${SYSTEM_STATUS.ROLE_NOT_FOUND} Role Not found`};

     
     // check if this child are for global role 
     childCompact=role.translateChildGlobalToCompact(parnetIns,child,childInstanceIndex);

     childCompact=childCompact < 0 ? role.translateChildGlobalToCompact(parnetIns,child,role.wildcard) : childCompact;

  

    if (childCompact === -1) {
        // no this child have no global role check if its in  wild card role 
                   childCompact=role.translateWildCardGlobalToCompact(parentId,child,childInstanceIndex);
                   childCompact=childCompact < 0 ? role.translateWildCardGlobalToCompact(parentId,child,role.wildcard) : childCompact;
                   wildCard=true;
   
    }

    // if not in both the access denied 
    if(childCompact === -1){
     return { code: SYSTEM_STATUS.ACCESS_DENIED, message: "Child instance not in role" };
    }

    if(grandChild !== null){

        if(wildCard){
            grandChildCompact=role.translateWildCardGlobalToCompact(parentId,grandChild,grandChildIndex);
             grandChildCompact= grandChildCompact < 0 ? role.translateWildCardGlobalToCompact(parentId,grandChild,role.wildcard) : grandChildCompact;

        }else{

            grandChildCompact=role.translateChildGlobalToCompact(parnetIns,grandChild,grandChildIndex);
            grandChildCompact= grandChildCompact < 0 ? role.translateChildGlobalToCompact(parnetIns,grandChild,role.wildcard): grandChildCompact;

        }

        if (grandChildCompact === -1){

            return { code: SYSTEM_STATUS.ACCESS_DENIED, message: "grand Child instance not in role" };

        }
    }


    
 let access= null;
 

  if(wildCard){

    if (role.globalStriders && role.globalStriders[parentId]) {
        parnetIns=role.wildcard;

        access = role.geteffectedAccess(GroupRoleId, parentId, parnetIns, child, childCompact, grandChild, grandChildCompact)
    }else{
        return {code:SYSTEM_STATUS.ACCESS_DENIED,message:`no wildCard for this parent type ${parentId}`}
    }

  }else{
     access = role.geteffectedAccess(
        GroupRoleId, 
        parentId, 
        parnetIns, 
        child, 
        childCompact, 
        grandChild, 
        grandChildCompact
    );

  } 


    // if access are conatin effective value the return it else continue to check ttl 
if (access && access?.code === undefined) return access;

  

  
   // check if this access is expired triger or add 
    if (access && access.code === SYSTEM_STATUS.PERMISSION_EXPIRED) {
        const newAddr = role.geteffected(GroupRoleId, parentId, parnetIns, child, childCompact, grandChild, grandChildCompact);
        
        // checking address type
        if (typeof newAddr === 'number') {
            const memberId = role.getEffectedValue(newAddr + 1);
            const expiredResourceType = grandChild ? grandChild : child;
            RoleBaseBuckets.addToExpierdBucket(GroupRoleId, memberId, expiredResourceType);
        }
    }
  
    return access; // 

}

checkAccessWithMonitor(GroupRoleId, parentId, parentInstanceIndex, child = null, childInstanceIndex = null, grandChild = null, grandChildIndex = null){
  
     
      record(DOMAIN.RBAC_DOMAIN,EVENT_TYPES.RBAC_AUTH_CHECK,EVENT_MTYPES.METRIC_C);

    let parnetIns=parentInstanceIndex;
    

 
 let wildCard=false;
 let grandChildCompact= null;
 let childCompact= null;

 /** @type {RoleBinaryWorker} */
 const role = this.getRole(GroupRoleId);
          // if role id class not fount 

          
     if (!role)   {

        record(DOMAIN.RBAC_DOMAIN,EVENT_TYPES.RBAC_AUTH_DENIED,EVENT_MTYPES.METRIC_C);
        
        return {code:SYSTEM_STATUS.ACCESS_DENIED,message: `${SYSTEM_STATUS.ROLE_NOT_FOUND} Role Not found`}
    };

     
     // check if this child are for global role 
     childCompact=role.translateChildGlobalToCompact(parnetIns,child,childInstanceIndex);

  

    if (childCompact === -1) {
        // no this child have no global role check if its in  wild card role 
                   childCompact=role.translateWildCardGlobalToCompact(parentId,child,childInstanceIndex);
                   wildCard=true;
   
    }

    // if not in both the access denied 
    if(childCompact === -1){
          record(DOMAIN.RBAC_DOMAIN,EVENT_TYPES.RBAC_AUTH_DENIED,EVENT_MTYPES.METRIC_C);
     return { code: SYSTEM_STATUS.ACCESS_DENIED, message: "Child instance not in role" };
    }

    if(grandChild !== null){

        if(wildCard){
            grandChildCompact=role.translateWildCardGlobalToCompact(parentId,grandChild,grandChildIndex);

        }else{

            grandChildCompact=role.translateChildGlobalToCompact(parnetIns,grandChild,grandChildIndex);

        }

        if (grandChildCompact === -1){

            record(DOMAIN.RBAC_DOMAIN,EVENT_TYPES.RBAC_AUTH_DENIED,EVENT_MTYPES.METRIC_C);
            return { code: SYSTEM_STATUS.ACCESS_DENIED, message: "grand Child instance not in role" };

        }
    }


    
 let access= null;
 

  if(wildCard){

    if (role.globalStriders && role.globalStriders[parentId]) {
        parnetIns=role.wildcard;

        access = role.geteffectedAccess(GroupRoleId, parentId, parnetIns, child, childCompact, grandChild, grandChildCompact)
    }else{
       
        record(DOMAIN.RBAC_DOMAIN,EVENT_TYPES.RBAC_AUTH_DENIED,EVENT_MTYPES.METRIC_C)
        return {code:SYSTEM_STATUS.ACCESS_DENIED,message:`no wildCard for this parent type ${parentId}`}
    }

  }else{
     access = role.geteffectedAccess(
        GroupRoleId, 
        parentId, 
        parnetIns, 
        child, 
        childCompact, 
        grandChild, 
        grandChildCompact
    );

  } 


    // if access are conatin effective value the return it else continue to check ttl 
if (access && access?.code === undefined) return access;

  

  
   // check if this access is expired triger or add 
    if (access && access.code === SYSTEM_STATUS.PERMISSION_EXPIRED) {
        const newAddr = role.geteffected(GroupRoleId, parentId, parnetIns, child, childCompact, grandChild, grandChildCompact);

          record(EVENT_TYPES.RBAC_AUTH_EXPIRED,EVENT_MTYPES.METRIC_C);
        
        // checking address type
        if (typeof newAddr === 'number') {
            const memberId = role.getEffectedValue(newAddr + 1);
            const expiredResourceType = grandChild ? grandChild : child;
            RoleBaseBuckets.addToExpierdBucket(GroupRoleId, memberId, expiredResourceType);
        }
    }
  
    return access; // 

}

getPrimary(packed32){
    return (packed32 & 0xFFFF)
}

/**
 * 
 * @param {} packed32 
 * @returns Self action 
 */
getPrimaryAction(packed32){
    return (packed32 & 0x0F)
}
/**
 * 
 * @param {number} packed32 
 * @returns others Action
 */
getOthersAction(packed32){
     return ( (packed32 >> 16) & 0x0F) 
}
/**
 * 
 * @param {*} packed32 
 * @returns self boundry
 */
getPrimaryBoundary(packed32){
    return (packed32 & 0xF0)
}
/**
 * 
 * @param {*} packed32 
 * @returns othersBoundary
 */
getOthersBoundary(packed32){
     return ( (packed32 >> 16) & 0xF0) 
}
/**
 * 
 * @param {*} packed32 
 * @returns others bytes 
 */
getOthers(packed32){
    return ((packed32 >> 16) & 0xFFFF)
}
/**
 * its used for check effective others (others means others resources that not belong to this users)
 * @param {*} packed32 
 * @param {*} targetActionBit 
 * @returns return true if its allowed and false if not 
 */
canPerformOnOthers(packed32, targetActionBit) {
        const othersAction = (packed32 >>> 16) & 0xFFFF;
        return (othersAction & targetActionBit) === targetActionBit;
    }

/**
 * 
 * @param {*} packed32 
 * @param {*} targetActionBit 
 * @returns check if users is allow to do thing in resource belonge to its
 */
canPerformPrimary(packed32, targetActionBit) {
        const primaryAction = packed32 & 0xFFFF;
        return (primaryAction & targetActionBit) === targetActionBit;
    }

}