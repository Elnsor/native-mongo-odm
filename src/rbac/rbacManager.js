

import { resourceInstance } from "./buckets/systemReourcesInstances.js";
import { RoleCompiler } from "./compiler/schema-parser.js";
import { RoleBinaryWorker } from "./allocator/binary-worker.js";
import { RoleBaseBuckets } from "./buckets/buckets.js";
import { AutherizationCheck } from "./authorized/authorization.js";

import { RoleBuilder } from "./builder/buildGroupRole.js";
import { TYPE_IDS ,SYSTEM_STATUS} from "./constant/resourceType.js";
import { record } from "../Monitor/monitoringSystem.js";
import { EVENT_TYPES,EVENT_MTYPES ,DOMAIN} from "../Monitor/constant/eventType.js";
import { initializeMonitoring } from "../Monitor/monitoringSystem.js";

/**
* Interface for RBAC/ABAC  system 
 */

/**
 *@import {MonitoringInitOption} from '../Monitoring/constant/typeDef.js'
 */
export class RBACManager {
    #authCheck;
    #initialized = false;

    constructor() {
        this.#authCheck = new AutherizationCheck();
    }

    /**
     * initailize system 
     * @param {MonitoringInitOption} options - initialization Option
     * @returns {RBACManager}
     */
    initialize(options = {}) {
        if (this.#initialized) {
            console.warn('[RBAC] Already initialized');
            return this;
        }

    
        if (options.monitoring) {
           
            initializeMonitoring(options.monitoring);
        }

        this.#initialized = true;
        console.log('[RBAC] ✅ Initialized successfully');
        
        return this;
    }

    /**
     *@import {ResourcePid, ResourcePid, ResourcePid, ResourcesName, ResourcesName, ResourcesName} from "./constant/typesDef.js"
     * @param {import("./constant/typesDef.js").ResourcesName} resourceName -Name her Is resource Type Name 
     * @param {string[]} instances -- resources instance Name like e.g(tables-1,table-2..etc) 
     * @returns {boolean}
     */
    registerResource(resourceName, instances = []) {
        for (const instance of instances) {
            const result = resourceInstance.AddResourceInstance(resourceName, instance);
            if (result?.code) {
                console.error(`[RBAC] Failed to register instance ${instance}:`, result.message);
                return false;
            }
        }
        return true;
    }

/**
     *@import {ResourcePid, ResourcePid, ResourcePid, ResourcesName, ResourcesName} from "./constant/typesDef.js"
     * @param {import("./constant/typesDef.js").ResourcesName} resourceName -Name her Is resource Type Name 
     * @param {string[]} instances -- resources instance Name like e.g(tables-1,table-2..etc) 
     * @returns {boolean}
     */
    getregisterResource(resourceName, instance ) {
        
            const result = resourceInstance.getResourceInstanceIndex(resourceName, instance);
            if (result?.code) {
                console.error(`[RBAC] Failed to get register instance ${instance}:`, result.message);
                return false;
            }
       
        return result;
    }

    /**
     * Build GroupRoles
     * @param {string} roleName --GroupRoleName
     * @param {RoleBuilder} roleDefinition - GroupRole Definition (JSON)
     * @returns {Object} - Result of operation
     */
    createRole(roleName, roleDefinition) {
        try {
            // paresed and compiled Role
            record(DOMAIN.RBAC_DOMAIN,EVENT_TYPES.RBAC_COMPILE_START, EVENT_MTYPES.METRIC_C);
            
            
            const startTime = process.hrtime.bigint();

            const compiler = new RoleCompiler(roleName, roleDefinition);

             const duration = Number(process.hrtime.bigint() - startTime);
             record(DOMAIN.RBAC_DOMAIN,EVENT_TYPES.RBAC_COMPILE_END, EVENT_MTYPES.METRIC_H, duration)
            
            const cmp=compiler.compile();
            if(cmp?.code < 0) {
                 record(DOMAIN.RBAC_DOMAIN,EVENT_TYPES.RBAC_COMPILE_ERROR, EVENT_MTYPES.METRIC_C);
                  return { 
                    success: false, 
                    ...cmp
                };
            }

             record(DOMAIN.RBAC_DOMAIN,EVENT_TYPES.RBAC_COMPILE_END, EVENT_MTYPES.METRIC_C);


            // build Worker
            const worker = new RoleBinaryWorker(roleName, compiler);
         

            // register Group Roles
            const registered = RoleBaseBuckets.registerNewRole(roleName, RoleBinaryWorker);
            if (!registered) {
                return { 
                    success: false, 
                    ...registered
                };
            }

             record(DOMAIN.RBAC_DOMAIN,EVENT_TYPES.RBAC_ROLE_REGISTERED,EVENT_MTYPES.METRIC_C);

            const instance = RoleBaseBuckets.createRegisterRole(roleName, roleName, compiler);
            if (!instance || instance.code) {
                return { 
                    success: false, 
                    code: instance?.code || -1,
                    message: instance?.message || 'Failed to create role instance' 
                };
            }
             record(DOMAIN.RBAC_DOMAIN,EVENT_TYPES.RBAC_ROLE_INSTANTIATED,EVENT_MTYPES.METRIC_C);

               const roleInit=instance.addRolesValuseToRowBinary();

             if (roleInit?.code !== undefined) {
                return { 
                    success: false, 
                    ...roleInit
                };
            }
          
            return { 
                success: true, 
                message: 'Role created successfully',
                roleId: resourceInstance.getRoleId(roleName)
            };

        } catch (error) {
            return { 
                success: false, 
                code: SYSTEM_STATUS.ROLE_CREAT_ERROR,
                message: error.message 
            };
        }
    }

    /**
     * replace exestance group role with new updated one with same group role id  in (Atomic Hot-Swap)
     * @param {string} roleName - Group Role Name
     * @param {Object} newRoleDefinition
     * @returns {Object}
     */
    updateRole(roleName, newRoleDefinition,option={}) {
       
       const result=RoleBaseBuckets.replaceRoleDefinition(roleName,newRoleDefinition,option);
        if(result.code !== SYSTEM_STATUS.SUCCESS) {
                return { 
                    success: false, 
                    ...result
                };
            }

             return { 
                    success: true, 
                    message:`Group Role Name ${roleName} is updated`
                };
        
    }

    /**
     * delete role Groub by Name
     * @param {string} roleName - Role Group Name 
     * @returns {Object}
     */
    deleteRole(roleName) {
        const removed = RoleBaseBuckets.removeRegisterRole(roleName);
        if (removed) {
            return { success: true, message: 'GRole deleted successfully' };
        } else {
            return { success: false, message: 'Role not found' };
        }
    }

    /**
     * this method used for check authoriztion u can used for example insid authorization middlewar
     * @import {ResourcePid as rs} from "./constant/typesDef.js"
     * @param {number} roleId -- role id
     * @param {ResourcePid} pType 
     * @param {number} pInstId 
     * @param {ResourcePid | null} cType 
     * @param {number|null} cInsId 
     * @param {ResourcePid | null} gcType 
     * @param {number | null} gcInsId 
     * @returns effected Action | {code:codeNumber,message}
     */

    checkAccess(roleId,pType,pInstId,cType=null,cInsId=null,gcType=null,gcInsId=null){

       // let start=0;
        let access=0;

        if(this.#initialized){
           
            const start =performance.now();

           //start=performance.now();


          access=this.#authCheck.checkAccessWithMonitor(roleId,pType,pInstId,cType,cInsId,gcType,gcInsId)
          //const dur=performance.now()-start;
             const durationNs =( performance.now()- start) * 1000000
           
          record(DOMAIN.RBAC_DOMAIN,EVENT_TYPES.RBAC_AUTH_CHECK,EVENT_MTYPES.METRIC_H,durationNs);
          return access;

        }
        return this.#authCheck.checkAccess(roleId,pType,pInstId,cType,cInsId,gcType,gcInsId);


    }
    /**
     * (Effects)
     * @private
     */
    decodeActionEffects(effects) {
        const permissions = [];
        if (effects & 1) permissions.push('read');
        if (effects & 2) permissions.push('write');
        if (effects & 4) permissions.push('delete');
        if (effects & 8) permissions.push('create');
        return permissions;
    }

    decodeBoundaryEffects(effects) {
        const permissions = [];
        if (effects & 16) permissions.push('OWN');
        if (effects & 32) permissions.push('LIMITED');
        if (effects & 64) permissions.push('ALL');
        if (effects & 128) permissions.push('create');
        return permissions;
    }
AllowedPrimaryTarget(primaryEffect,targetActionBit){
    return this.#authCheck.canPerformPrimary(primaryEffect,targetActionBit);
}
AllowedTargetToOthers(othersEffect,targetActionBit){
    return this.#authCheck.canPerformOnOthers(othersEffect,targetActionBit)
}


    /**
     * 
     * @param {import("./constant/typesDef.js").ResourcesName } resourceName - Rsource Type Name 
     * @param {string|number} instanceName - 
     * @returns {Object}
     */
    deleteInstance(resourceName, instanceName,force=false) {
        
        const parentType=TYPE_IDS[resourceName]
        if(parentType === undefined){
             return { success: false, code: SYSTEM_STATUS.INVALID_RESOURCE_PID, message: `not valid Resource Type Name ${resourceName} ` };

        }
        const resIndex = resourceInstance.getResourceInstanceIndex(resourceName, instanceName);
        if (resIndex?.code) {
            return { success: false, code: resIndex.code, message: resIndex.message };
        }

         const activeRoles = RoleBaseBuckets.getActiveRolesForInstance(parentType, resIndex);
    
    if (activeRoles.length > 0) {
        const roleNames = activeRoles
            .map(pid => resourceInstance.getGoupNameById(pid))
            .filter(name => name !== undefined);
            
        return { 
            code: SYSTEM_STATUS.INSTANCE_NOT_ALLOWED, //  SYSTEM_STATUS 
            message: `Cannot delete instance: it is actively used by ${activeRoles.length} role(s) [${roleNames.join(', ')}]. Revoke access first or use .`,
            activeRoles: activeRoles,
            roleNames: roleNames
        };

       
    }
       

        const result = resourceInstance.deletetResourceInstanceIndex(resourceName,instanceName);
        
        if (result === true) {
            return { 
                success: true, 
                message: 'Instance deleted successfully',
                updatedRolesCount: result.updatedRolesCount
            };
        } else {
            return { 
                success: false, 
                code: result.code,
                message: result.message 
            };
        }
        
    }

    /**
     * return system info 
     * @returns {Object}
     */
    getSystemInfo() {
        return {
            totalRoles: RoleBaseBuckets.insBucket.size,
            activeRoles: Array.from(RoleBaseBuckets.insBucket.keys()).map(roleId => ({
                roleId,
                roleName: resourceInstance.getGoupNameById(roleId),
                bufferSize: RoleBaseBuckets.getInsRegisterRoleByPID(roleId)?.buffer?.length || 0
            }))
        };
    }
}