

import { fastDeepClone } from "./../utils/utils.js";
import { SYSTEM_STATUS,TYPE_IDS_NAME } from "../constant/resourceType.js";
import { resourceInstance } from "./systemReourcesInstances.js";
import { RoleCompiler } from "../compiler/schema-parser.js";
import { RoleBinaryWorker } from "../allocator/binary-worker.js";

import { record } from "../../Monitor/monitoringSystem.js";
import { EVENT_TYPES, EVENT_MTYPES ,DOMAIN} from "../../Monitor/constant/eventType.js";
import e from "express";

/**
 * ### RoleBuckets
 * - each GroupRole Have its own Class
 * to create new group class it must register it first in this bucket 
 * its register by its Id and class 
 * -when you need to instantiated GroupRoleClass you do by using **createRegisterRole()** method
 * this instance are also saved in insBucket
 * -when role are saved in insBucket its state is active
 * -------------------
 * - #### another used cases of this class 
 * - **Not allowed for Delete Any Parent Resource Instance Linked to Active Role :-**
 * - when Group Role is Active and one of its resources instance targted by this role is need to be delete , the deletion of this instance is denied becouse its linked to active role 
 * if the Grroup Role is Active meaning its have Role instace save in insBucket you cant delete it 
 * ---- 
 * - ### another usig case of this 
 * 
 * ### **Expired and Update**  
 * - when one member role of GroupRole are expired
 * - any expired member are saved in expiredBucket so this save member are then deleted form its GroupRole after Update its 
 * - the operation of revocing expired member is done on **background** so its **not blocking operation** and its done in **Atomic** way
 * - the expired backed have two window to **trigger** flush its content and begin the atomic update for GroupRole for each expired members 
 * - **threshold window (Batch):** is act as threshold by default its 50 if the bucket contain 50 expired member its trigger flush 
 * - **time window :** by defualt its 5 seconde (timer intervel )if the bucket size is less than its threshold its not triggering flush until the time window is elapsed then its trigger flush operation 
 * 
 * --
 * any update are done in atomic way and its operation happen in background 
 */
export class RoleBaseBuckets {

    static bucket = new Map();
    static insBucket = new Map();
    static expiredBucket=new Map();
    static isFlushing = false;
    // Reverse lookup: res_pid -> Map<instanceIndex, Set<GroupPid>>
    static instanceToRoles = new Map();
     //  DUAL-WINDOW CONFIGURATION FOR EXPIRATION BUCKETS
    static BATCH_THRESHOLD = 50;       // Flush immediately if bucket reaches 50 entries
    static FLUSH_INTERVAL_MS = 5000;   // Flush every 5 seconds if bucket has entries
    static flushTimer = null;          // Holds the reference to the pending timeout

    /**
     * Registers a role class it must be Class not instance of it definition into the primary bucket.
     * usaly this class is RoleBinaryWorker after that u can isntantiated for it 
     * @param {RoleBinaryWorker} RoleClass
     * @param {String} GroupRoleName
     */
    static registerNewRole(GroupRoleName, RoleClass) {
        const GroupPid = resourceInstance.getRoleId(GroupRoleName);
        if (!GroupPid || this.bucket.has(GroupPid)) return {code:SYSTEM_STATUS.ROLE_EXISTS,message:`RoleBucketError: Same Group Role Pid are registered in this Buckets`};

        this.bucket.set(GroupPid, RoleClass);
       
        return true;
    }

    /**
     * Maps parent instance indices from a worker role to instanceToRoles index.
     * Zero-allocation iteration over Set instances.
     * parent => parent Instance => roleBucket[Role id ]
     * it tell us this resource instance are targted by thus GroupRoles so we cant deleted it 
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
     * @param {String} GroupRoleName
     * @param {*} args
     * @returns {RoleBinaryWorker} insClass 
     */
    static createRegisterRole(GroupRoleName, ...args) {
        const GroupPid = resourceInstance.getRoleId(GroupRoleName);
        if (!GroupPid) return { code: SYSTEM_STATUS.INVALID_ROLE_ID, message: `RoleBucketError:  RegisterRole Error: Not Valid GroupRoleName ${GroupRoleName}` };
        if (!this.bucket.has(GroupPid) || this.insBucket.has(GroupPid)) {
            return { code: SYSTEM_STATUS.RESOURCE_NOT_FOUND, message: `RoleBucketError:  RegisterRole Error: No class in Bucket or instance already exists for ${GroupRoleName}` };
        }

        const RoleClass = this.bucket.get(GroupPid);
        const insClass = new RoleClass(...args);
        if (!insClass){
            
            return { code: SYSTEM_STATUS.UNCOMPILED_WORKER, message: `RoleBucketError:  RegisterRole Error: Failed to instantiate class for ${GroupRoleName}`}
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
     * @returns {Array<number>} [roleId,] or []
     */
    static getActiveRolesForInstance(res_pid, instanceIndex) {
        const resMap = this.instanceToRoles.get(res_pid);
        if (!resMap) return [];

        const rolesSet = resMap.get(instanceIndex);
        return rolesSet ? Array.from(rolesSet) : [];
    }

     /**
     * Returns true if this reources Parent instance is bound to Actives roles if not bound return false 
     * @param {ResourcePid} res_pid
     * @param {number} instanceIndex
     * @returns {boolean} true | false
     */

    static isParentReourceInstanceActive(res_pid, instanceIndex){

         const resMap = this.instanceToRoles.get(res_pid);
        if (!resMap) return false

        const rolesSet = resMap.get(instanceIndex);
        return rolesSet ? rolesSet.size > 0 : false;

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
        if(GroupPid?.code !== undefined) return {code:SYSTEM_STATUS.ROLE_NOT_FOUND, message : `RoleBucketError:  :${GroupPid.message} `};
        return this.insBucket.get(GroupPid) ?? {code:SYSTEM_STATUS.ROLE_NOT_FOUND, message: `RoleBucketError:  : Role Not Found in Active buckets`};
    }
    static isRoleActiveByName(GroupRoleName) {
        const GroupPid = resourceInstance.getRoleId(GroupRoleName);
        if(GroupPid?.code !== undefined) return false;
        return this.insBucket.has(GroupPid);
    }
    static isRoleActiveById(GroupPid) {
        return this.insBucket.has(GroupPid);
    }
/**
     * get GroupRoleClass instance from insBucket by GroupRoleId
     * @param {number} GroupPid
     */
    static getInsRegisterRoleByPID(GroupPid) {
        return this.insBucket.get(GroupPid) || null;
    }

  /**
   * used this method if need to replace exist Active role with new fresh one the new one take same old Role id 
   * @param {String} groupRoleName 
   * @param {Object} newDefinition 
   * @param {*} options 
   * @returns  
   */ 
static replaceRoleDefinition(groupRoleName, newDefinition, options = {}) {
    const GroupPid = resourceInstance.getRoleId(groupRoleName);
    if (!GroupPid || !this.insBucket.has(GroupPid)) {
        return { code: SYSTEM_STATUS.ROLE_NOT_FOUND, message: `RoleBucketError:  Role ${groupRoleName} not found or not active` };
    }

    try {
       
        const newCompiler = new RoleCompiler(groupRoleName, newDefinition, true);
        const compileResult = newCompiler.compile();
        
        if (compileResult !== true) {
            return { code: SYSTEM_STATUS.RECOMPILE_FAILED, message: `RoleBucketError:  Compilation failed: resource Code:${compileResult.code}-${compileResult.message}` };
        }

        const newWorker = new RoleBinaryWorker(groupRoleName, newCompiler);
        newWorker.addRolesValuseToRowBinary();

        const swapResult = this.updateExistedInstanceRole(groupRoleName, newWorker);
        
        return swapResult === true 
            ? { code: SYSTEM_STATUS.SUCCESS, message: `RoleBucketError:  Role ${groupRoleName} replaced successfully` }
            : swapResult;

    } catch (error) {
        return { code: SYSTEM_STATUS.RECOMPILE_FAILED, message: `RoleBucketError:  Update error: ${error.message}` };
    }
  
}

/**
 *   scheduling: Triggers based on Batch Size OR Time Window
 * this for triggering flush operation 
 */
static scheduleBackgroundFlush() {
    // 1. If already flushing, do nothing (the recursive check in `finally` will handle leftovers)
    if (this.isFlushing) return;

    // 2. BATCH WINDOW: If we hit the threshold, flush immediately
    if (this.expiredBucket.size >= this.BATCH_THRESHOLD) {
        this.cancelPendingFlush();
        this.triggerBackgroundFlush();
        return;
    }

    // 3. TIME WINDOW: If no timer is running, start one
    if (!this.flushTimer) {
      
        this.flushTimer = setTimeout(() => {
        this.triggerBackgroundFlush();
        }, this.FLUSH_INTERVAL_MS);
    }
}

/**
 * Clears the pending time window timer
    */
static cancelPendingFlush() {
    if (this.flushTimer) {
        clearTimeout(this.flushTimer);
        this.flushTimer = null;
    }
}

    //  Lightweight, non-blocking addition to the bucket
    /**
     * any active group roles have its member expired its added to expired bucket .. in feature update this active roles 
     * Mebmer role are targted resouces Caled Leaf and its have Id and it member of GroupRoleId    
     * @param {number} roleId -- Role Id 
     * @param {number} memberId -- Role Memeber Id 
     * @param {ResourcePid} leafId -- Leaf Type 
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

        // run schedule background processing for checking threshold 
        this.scheduleBackgroundFlush();
    }

    //  Safely trigger background execution via the event loop queue
    static triggerBackgroundFlush() {
        this.cancelPendingFlush(); 
       
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
                     this.scheduleBackgroundFlush();
                }
            }
        });
    }

    /**
     * this method run the flushing Atomic Operation
     */

static async flushExpiredBucketAsync() {
     
    const entries = Array.from(this.expiredBucket.entries());
    this.expiredBucket.clear();
    const now = Math.floor(Date.now() / 1000);

    for (const [roleId, membersMap] of entries) {
        const currentWorker = this.getInsRegisterRoleByPID(roleId);
        if (!currentWorker) continue;

        //  Clone ONLY the JSON data (cheap shallow clone)
        // The live worker is completely untouched. (Atomic)
       
        const clonedMemberGroups = { ...currentWorker.roles.ListOfMemberGroups };
        let hasChanges = false;

       
        //  Mutate the CLONE (surgical removal of expired owners)
       
        for (const [memberId, leafSet] of membersMap.entries()) {
            const memberName = currentWorker.roles.getRoleMemberNameById(memberId);

            if (!clonedMemberGroups[memberName]) continue;

            for (const leafId of leafSet) {
                const leafName = TYPE_IDS_NAME[leafId];
                const rule = clonedMemberGroups[memberName][leafName];
                if (!rule) continue;

                if (rule.nestedOwnersMap) {
                    const newNestedArray = [];
                    for (const nestedEntry of rule.nestedOwnersMap) {
                        const beforeLength = nestedEntry.allowedOwners.length;
                        nestedEntry.allowedOwners = nestedEntry.allowedOwners.filter(
                            owner => !(owner.ttl > 0 && now >= owner.ttl)
                        );
                        if (nestedEntry.allowedOwners.length < beforeLength) {
                            hasChanges = true;
                        }
                        if (nestedEntry.allowedOwners.length > 0) {
                            newNestedArray.push(nestedEntry);
                        }
                    }
                    if (newNestedArray.length > 0) {
                        rule.nestedOwnersMap = newNestedArray;
                    } else {
                        clonedMemberGroups[memberName][leafName] = null;
                    }
                } else if (rule.ownerInstance) {
                    const beforeLength = rule.ownerInstance.length;
                    rule.ownerInstance = rule.ownerInstance.filter(
                        owner => !(owner.ttl > 0 && now >= owner.ttl)
                    );
                    if (rule.ownerInstance.length < beforeLength) {
                        hasChanges = true;
                    }
                    if (rule.ownerInstance.length === 0) {
                        clonedMemberGroups[memberName][leafName] = null;
                    }
                }
            }
        }

        if (!hasChanges) continue;

       //Create a FRESH compiler with the cloned data
        // Live worker remains untouched. If this fails, system keeps working (act as rolleback).
        const GroupName = currentWorker.roles.groupRoleName;
        /**
         * @type {RoleCompiler}
         */
        const freshCompiler = new RoleCompiler(GroupName, clonedMemberGroups, true);
        
        // Inject the surgically cleaned data
        freshCompiler.ListOfMemberGroups = clonedMemberGroups;
        freshCompiler.memberTableMap=new Map(currentWorker.roles.memberTableMap)
        freshCompiler.ListOfGroups=currentWorker.ListOfGroups;

        // Run the fast-path (skips heavy merge phase)
        const roleIdForCompile = resourceInstance.getRoleId(GroupName);
        const compileResult = freshCompiler.parentToLeafMap(clonedMemberGroups, roleIdForCompile);
        
        if (compileResult !== true) {
            //  COMPILATION FAILED — Log and continue
            //  LIVE WORKER IS STILL INTACT AND SERVING REQUESTS
            console.error(`[RBAC] RoleBucketsError: ExpirationUpdateError: Recompilation failed for role ${GroupName}:${roleIdForCompile} , compileResult`);
            continue;
        }

        // Recalculate striders on fresh compiler
        freshCompiler.calculateTotalStridersSchemaSlice();

      
        // Build new worker from fresh compiler
      
        const newWorker = new RoleBinaryWorker(GroupName, freshCompiler);
        newWorker.addRolesValuseToRowBinary();

       
        //  Atomic hot-swap (only happens on total success)
       
        this.updateExistedInstanceRole(GroupName, newWorker);

        // Yield to event loop none blocking
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
            return { code:SYSTEM_STATUS.INVALID_ROLE_ID, message: `RoleBucketError:  Update Error: Invalid GroupRoleName ${GroupRoleName}` };
        }

        if (!this.insBucket.has(GroupPid)) {
            return { code: SYSTEM_STATUS.RESOURCE_NOT_FOUND, message: `RoleBucketError:  Update Error: Instance bucket is not initialized` };
        }

        if (!preCompiledWorkerInstance || !preCompiledWorkerInstance.buffer) {
            return { code: SYSTEM_STATUS.RECOMPILE_FAILED, message: `RoleBucketError:  Update Error: Invalid or uncompiled worker instance provided` };
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

    }