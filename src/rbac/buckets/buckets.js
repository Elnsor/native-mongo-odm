/**
 * each GroupRole Have its own Class
 * to create new group class it must rigester it first in this bucket 
 * its register by its Id and class 
 * when you need to instantiated GroupRoleClass you do by using createRegisterRole() method
 * this instance are also saved in insBucket
 * -------------------
 * another used cases of this class 
 * when Group Role is Active an one of its resources instance targted by this role is deleted whey apply update 
 * to this class to got same GroupRole class but without deleted instance
 * 
 * ---- 
 * another usig case of this 
 * when one member role of GroupRole are expired  
 * any expired member are saved in expiredBucket so this save member are then deleted form its GroupRole after Update its 
 * own GroupClass 
 * 
 * --
 * any update are done in atomic way and its operation happen in background 
 */

import { fastDeepClone } from "./../utils/utils.js";
import { SYSTEM_STATUS,TYPE_IDS_NAME } from "../constant/resourceType.js";
import { resourceInstance } from "./systemReourcesInstances.js";
import { RoleCompiler } from "../compiler/schema-parser.js";
import { RoleBinaryWorker } from "../allocator/binary-worker.js";

import { record } from "../../Monitor/monitoringSystem.js";
import { EVENT_TYPES, EVENT_MTYPES ,DOMAIN} from "../../Monitor/constant/eventType.js";
export class RoleBaseBuckets {

    static bucket = new Map();
    static insBucket = new Map();
    static expiredBucket=new Map();
    static isFlushing = false;
    // Reverse lookup: res_pid -> Map<instanceIndex, Set<GroupPid>>
    static instanceToRoles = new Map();

    /**
     * Registers a role class it must be Class not instance of it definition into the primary bucket.
     * usaly this class is RoleBinaryWorker after that u can isntantiated for it 
     * @param {RoleBinaryWorker} RoleClass
     * @param {String} GroupRoleName
     */
    static registerNewRole(GroupRoleName, RoleClass) {
        const GroupPid = resourceInstance.getRoleId(GroupRoleName);
        if (!GroupPid || this.bucket.has(GroupPid)) return {code:SYSTEM_STATUS.ROLE_EXISTS,message:'Same Group Role Pid are registered in this Buckets'};

        this.bucket.set(GroupPid, RoleClass);
       
        return true;
    }

    /**
     * Maps parent instance indices from a worker role to instanceToRoles index.
     * Zero-allocation iteration over Set instances.
     * parent => parent Instance => roleBucket[Role id ]
     * it tell us this resource instance are targted by thus GroupRoles
     * 
     * @param {RoleBinaryWorker} insClass 
     */
    static createParentInstanceMapToRoleId(insClass) {
        if (!insClass?.roles?.getPTI) return;

        const parentToInstance = insClass.roles.getPTI();
        const RoleId = insClass.groupRolesPid;

        for (const [resPid, data] of parentToInstance.entries()) {
            if (!data?.instance) continue;

            let pPid = this.instanceToRoles.get(resPid);
            if (!pPid) {
                pPid = new Map();
                this.instanceToRoles.set(resPid, pPid);
            }

            // Zero-allocation loop directly over Set iterator
            for (const insIndex of data.instance) {
                let roleSet = pPid.get(insIndex);
                if (!roleSet) {
                    roleSet = new Set();
                    pPid.set(insIndex, roleSet);
                }
                roleSet.add(RoleId);
            }
        }
    }

    /**
     * Removes active role instances from the instanceToRoles reverse index.
     * Safe against null/missing role references.
     * 
     * @param {number} GroupPid 
     */
    static removeRolesFromInstanceToRoles(GroupPid) {
        const roleClass = this.getInsRegisterRoleByPID(GroupPid);
        if (!roleClass?.roles?.getPTI) return;

        const parentToInstance = roleClass.roles.getPTI();
        const RoleId = GroupPid;

        for (const [resPid, data] of parentToInstance.entries()) {
            if (!data?.instance || !this.instanceToRoles.has(resPid)) continue;

            const pPid = this.instanceToRoles.get(resPid);

            for (const insIndex of data.instance) {
                const insSet = pPid.get(insIndex);
                if (!insSet) continue;

                insSet.delete(RoleId);
                if (insSet.size === 0) pPid.delete(insIndex);
            }
            if (pPid.size === 0) this.instanceToRoles.delete(resPid);
        }
    }

    /**
     * Instantiates and registers an active role instance.
     */
    static createRegisterRole(GroupRoleName, ...args) {
        const GroupPid = resourceInstance.getRoleId(GroupRoleName);
        if (!GroupPid) return { code: SYSTEM_STATUS.INVALID_ROLE_ID, message: `RegisterRole Error: Not Valid GroupRoleName ${GroupRoleName}` };
        if (!this.bucket.has(GroupPid) || this.insBucket.has(GroupPid)) {
            return { code: SYSTEM_STATUS.RESOURCE_NOT_FOUND, message: `RegisterRole Error: No class in Bucket or instance already exists for ${GroupRoleName}` };
        }

        const RoleClass = this.bucket.get(GroupPid);
        const insClass = new RoleClass(...args);
        if (!insClass){
            
            return { code: SYSTEM_STATUS.UNCOMPILED_WORKER, message: `RegisterRole Error: Failed to instantiate class for ${GroupRoleName}`}
        }

        this.insBucket.set(GroupPid, insClass);
        record(DOMAIN.RBAC_DOMAIN,EVENT_TYPES.RBAC_ROLE_ACTIVE, EVENT_MTYPES.METRIC_G, this.insBucket.size)
        this.createParentInstanceMapToRoleId(insClass);
       

        return insClass;
    }

    /**
     * Returns an array snapshot of all active GroupRolePids bound to a specific instance index.
     * @param {ResourcePid} res_pid
     * @param {number} instanceIndex
     */
    static getActiveRolesForInstance(res_pid, instanceIndex) {
        const resMap = this.instanceToRoles.get(res_pid);
        if (!resMap) return [];

        const rolesSet = resMap.get(instanceIndex);
        return rolesSet ? Array.from(rolesSet) : [];
    }

    /**
     * 
     * @param {String} GroupRoleName 
     * @returns {class|null}-- 
     */
    static getRegisterRole(GroupRoleName) {
        const GroupPid = resourceInstance.getRoleId(GroupRoleName);
        return GroupPid ? (this.bucket.get(GroupPid) || null) : null;
    }
    /**
     * get GroupRoleClass instance from insBucket by GroupRoleName 
     * @param {string} GroupRoleName 
     * @returns {RoleBinaryWorker | null} if inst class is bucket return it else return null 
     */

    static getInsRegisterRole(GroupRoleName) {
        const GroupPid = resourceInstance.getRoleId(GroupRoleName);
        return GroupPid ? (this.insBucket.get(GroupPid) || null) : null;
    }
/**
     * get GroupRoleClass instance from insBucket by GroupRoleId
     * @param {number} GroupPid
     */
    static getInsRegisterRoleByPID(GroupPid) {
        return this.insBucket.get(GroupPid) || null;
    }

   
static replaceRoleDefinition(groupRoleName, newDefinition, options = {}) {
    const GroupPid = resourceInstance.getRoleId(groupRoleName);
    if (!GroupPid || !this.insBucket.has(GroupPid)) {
        return { code: SYSTEM_STATUS.ROLE_NOT_FOUND, message: `Role ${groupRoleName} not found or not active` };
    }

    try {
       
        const newCompiler = new RoleCompiler(groupRoleName, newDefinition, true);
        const compileResult = newCompiler.compile();
        
        if (compileResult !== true) {
            return { code: SYSTEM_STATUS.RECOMPILE_FAILED, message: `Compilation failed: resource Code:${compileResult.code}-${compileResult.message}` };
        }

        const newWorker = new RoleBinaryWorker(groupRoleName, newCompiler);
        newWorker.addRolesValuseToRowBinary();

        const swapResult = this.updateExistedInstanceRole(groupRoleName, newWorker);
        
        return swapResult === true 
            ? { code: SYSTEM_STATUS.SUCCESS, message: `Role ${groupRoleName} replaced successfully` }
            : swapResult;

    } catch (error) {
        return { code: SYSTEM_STATUS.RECOMPILE_FAILED, message: `Update error: ${error.message}` };
    }
  
}
    // 1. Lightweight, non-blocking addition to the bucket
    /**
     * any active group roles have its member expired it add it expired bucket to in feature update this active roles 
     * Mebmer role are targted resouces Caled Leaf and its have Id and it member of GroupRoleId    
     * @param {number} roleId 
     * @param {number} memberId 
     * @param {ResourcePid} leafId 
     */
    static addToExpierdBucket(roleId, memberId, leafId) {
        if (!this.expiredBucket.has(roleId)) {
            this.expiredBucket.set(roleId, new Map());
        }
        const role = this.expiredBucket.get(roleId);

        if (!role.has(memberId)) {
            role.set(memberId, new Set());
        }
        /** @type {Set} */
        const member = role.get(memberId);
        member.add(leafId);

        // Trigger background processing without blocking current execution
        this.triggerBackgroundFlush();
    }

    // 2. Safely trigger background execution via the event loop queue
    static triggerBackgroundFlush() {
        if (this.isFlushing || this.expiredBucket.size === 0) return;
        this.isFlushing = true;

        // Defer execution to the next tick so checkAccess returns immediately
        setImmediate(async () => {
            try {
                await this.flushExpiredBucketAsync();
            } catch (error) {
                console.error('Error in background role expiration flusher:', error);
            } finally {
                this.isFlushing = false;
                
                // If new expirations accumulated while flushing, loop back
                if (this.expiredBucket.size > 0) {
                    this.triggerBackgroundFlush();
                }
            }
        });
    }

    // 3. Asynchronous processing loop with event-loop yielding
    static async flushExpiredBucketAsync() {
        // Extract entries and clear the active bucket so new expirations can be collected concurrently
        const entries = Array.from(this.expiredBucket.entries());
        this.expiredBucket.clear();

        for (const [roleId, membersMap] of entries) {
            /** @type {RoleBinaryWorker} */
            const currentWorker = this.getInsRegisterRoleByPID(roleId);
            if (!currentWorker) continue;

            let listOfGroupsClone = fastDeepClone(currentWorker.roles.ListOfGroups);
            let hasChanges = false;

            for (const [memberId, leafSet] of membersMap.entries()) {
                const memberName = resourceInstance.getRoleMemberNameByIndexed(roleId, memberId);

                 if (!memberName || !listOfGroupsClone[memberName]) continue; 
                
                if (listOfGroupsClone[memberName]) {
                    for (const leafId of leafSet) {
                        const leafName = TYPE_IDS_NAME[leafId];
                        
                        if (listOfGroupsClone[memberName][leafName] !== undefined) {
                            listOfGroupsClone[memberName][leafName] = null;
                            hasChanges = true;
                        }
                    }
                }
            }

            // Heavy compilation and buffer swap happens safely in the background
           if (hasChanges) {
                     const groupName = currentWorker.roles.groupRoleName;
            
           
                   const result = this.replaceRoleDefinition(groupName, listOfGroupsClone, {
                    reason: "TTL expiration cleanup"
            });
            
            if (result.code !== SYSTEM_STATUS.SUCCESS) {
                console.error(`[RBAC] Failed to flush expired bucket for role ${groupName}:`, result.message);
            }
        }
        

            // Yield control back to the event loop between roles 
            // This prevents CPU starvation if multiple massive roles expire simultaneously
            await new Promise(resolve => setImmediate(resolve));
        }
    }


    /**
     * Safely unindexes and deletes a role registration.
     */
    static removeRegisterRole(GroupRoleName) {
        const GroupPid = resourceInstance.getRoleId(GroupRoleName);
        if (!GroupPid || !this.insBucket.has(GroupPid)) return null;

        // 1. Unindex references while worker instance is still accessible
        this.removeRolesFromInstanceToRoles(GroupPid);

        // 2. Capture instance before deletion
        const removedInstance = this.insBucket.get(GroupPid);

        // 3. Purge from buckets
        this.bucket.delete(GroupPid);
        this.insBucket.delete(GroupPid);
        record(DOMAIN.RBAC_DOMAIN,EVENT_TYPES.RBAC_ROLE_REMOVED,EVENT_MTYPES.METRIC_C);
        record(DOMAIN.RBAC_DOMAIN,EVENT_TYPES.RBAC_ROLE_ACTIVE, EVENT_MTYPES.METRIC_G, this.insBucket.size)

        return removedInstance;
    }

    /**
     * Atomic hot-swap of worker instances while maintaining index consistency.
     */
    /**
     * 
     * @param {string} GroupRoleName 
     * @param {RoleBinaryWorker} preCompiledWorkerInstance 
     * @returns 
     */
    static updateExistedInstanceRole(GroupRoleName, preCompiledWorkerInstance) {
        const GroupPid = resourceInstance.getRoleId(GroupRoleName);
        if (!GroupPid) {
            return { code:SYSTEM_STATUS.INVALID_ROLE_ID, message: `Update Error: Invalid GroupRoleName ${GroupRoleName}` };
        }

        if (!this.insBucket.has(GroupPid)) {
            return { code: SYSTEM_STATUS.RESOURCE_NOT_FOUND, message: `Update Error: Instance bucket is not initialized` };
        }

        if (!preCompiledWorkerInstance || !preCompiledWorkerInstance.buffer) {
            return { code: SYSTEM_STATUS.RECOMPILE_FAILED, message: `Update Error: Invalid or uncompiled worker instance provided` };
        }

        // 1. Purge old index mapping
        this.removeRolesFromInstanceToRoles(GroupPid);

        // 2. Atomic pointer swap in bucket
        this.insBucket.set(GroupPid, preCompiledWorkerInstance);
      

        // 3. Re-index with new compiled worker bindings
        this.createParentInstanceMapToRoleId(preCompiledWorkerInstance);

        record(DOMAIN.RBAC_DOMAIN,EVENT_TYPES.RBAC_ROLE_HOT_SWAP,EVENT_MTYPES.METRIC_C);

        return true;
    }

    
    /**
     * it used removed any expired role member from roleGroup and updated current active RoleGroup in Atomic way 
     * @param {number} roleId 
     * @param {number} memberId 
     * @param {ResourcePid} leafId 
     * @returns 
     */

    static safeRecompileAndHotSwapv1(roleId, memberId, leafId) {

        

        /**
         * @type {RoleBinaryWorker}
         */
        const currentWorker =  this.getInsRegisterRoleByPID(roleId);
        const memberName=resourceInstance.getRoleMemberNameByIndexed(roleId,memberId);
        let listOfGroupsClone=fastDeepClone(currentWorker.roles.ListOfGroups)
       
          
       
        const leafName=TYPE_IDS_NAME[leafId]
        if (listOfGroupsClone[memberName]) {
        listOfGroupsClone[memberName][leafName] = null;
    }
        
        const GroupName=currentWorker.roles.groupRoleName;
       

        const newCompile=new RoleCompiler(GroupName,listOfGroupsClone,true);
        const result=newCompile.compile();
        if(result !== true) return {code:SYSTEM_STATUS.RECOMPILE_FAILED,message:`Resource Code ${result.code}-${result.message}`};
        

        const newWorker = new RoleBinaryWorker(GroupName, newCompile);
        newWorker.addRolesValuseToRowBinary();
       
       
      
        return this.updateExistedInstanceRole(GroupName, newWorker);
    }

  

   }