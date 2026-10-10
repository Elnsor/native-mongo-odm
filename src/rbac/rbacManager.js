import { resourceInstance } from "./buckets/systemReourcesInstances.js";
import { RoleCompiler } from "./compiler/schema-parser.js";
import { RoleBinaryWorker } from "./allocator/binary-worker.js";
import { RoleBaseBuckets } from "./buckets/buckets.js";
import { AutherizationCheck } from "./authorized/authorization.js";
import { TYPE_IDS, SYSTEM_STATUS } from "./constant/resourceType.js";
import { record, initializeMonitoring, getMonitoring } from "../Monitor/monitoringSystem.js";
import { EVENT_TYPES, EVENT_MTYPES, DOMAIN } from "../Monitor/constant/eventType.js";

/**
 * Main Facade Interface for the RBAC/ABAC System.
 * Abstracts compilation, binary allocation, and authorization checks.
 */
export class RBACManager {
    #authCheck;
    #initialized = false;

    constructor() {
        this.#authCheck = new AutherizationCheck();
        if (getMonitoring().isEnabled) this.#initialized = true;
    }

    /**
     * Initialize the RBAC system with optional monitoring.
     * @param {Object} options - Initialization options (e.g., { monitoring: { enabled: true } })
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
        console.log('[RBAC]  Initialized successfully');
        return this;
    }

    /**
     * Register a resource type and its instances.
     * @param {string} resourceName - Resource Type Name (e.g., "COLLECTIONS")
     * @param {string[]} instances - Resource instance names (e.g., ["users", "products"])
     * @returns {boolean}
     */
    registerResource(resourceName, instances = []) {
        for (const instance of instances) {
            const result = resourceInstance.AddResourceInstance(resourceName, instance);
            if (result?.code) {
                console.error(`[RBAC] Failed to register instance '${instance}':`, result.message);
                return false;
            }
        }
        return true;
    }

    /**
     * Bulk register resources for easy system seeding.
     * @param {Object.<string, string[]>} resourcesMap - e.g., { COLLECTIONS: ["users", "products"], FIELD_METRICS: ["mat1"] }
     * @returns {boolean}
     */
    bulkRegisterResources(resourcesMap) {
        for (const [resourceName, instances] of Object.entries(resourcesMap)) {
            if (!this.registerResource(resourceName, instances)) {
                return false;
            }
        }
        return true;
    }

    /**
     * Get the global index of a registered resource instance.
     * @param {string} resourceName 
     * @param {string} instanceName 
     * @returns {number | Object}
     */
    getResourceInstanceIndex(resourceName, instanceName) {
        const result = resourceInstance.getResourceInstanceIndex(resourceName, instanceName);
        if (result?.code) {
            console.error(`[RBAC] Failed to get instance '${instanceName}':`, result.message);
            return result;
        }
        return result;
    }

    /**
     * Dry-run validation of a role definition without compiling/saving it.
     * @param {string} roleName 
     * @param {Object} roleDefinition 
     * @returns {Object} { success: boolean, message?: string }
     */
    validateRole(roleName, roleDefinition) {
        try {
            const compiler = new RoleCompiler(roleName, roleDefinition);
            const validationResult = compiler.groupRoleValidationSchema();
            
            if (validationResult !== true) {
                return { success: false, ...validationResult };
            }
            return { success: true, message: 'Role definition is valid' };
        } catch (error) {
            return { success: false, code: SYSTEM_STATUS.INVALID_SCHEMA, message: error.message };
        }
    }

    /**
     * Build, compile, and register a new Group Role.
     * @param {string} roleName 
     * @param {Object} roleDefinition 
     * @returns {Object}
     */
    createRole(roleName, roleDefinition) {
        try {
            record(DOMAIN.RBAC_DOMAIN, EVENT_TYPES.RBAC_COMPILE_START, EVENT_MTYPES.METRIC_C);
            const startTime = process.hrtime.bigint();

            const compiler = new RoleCompiler(roleName, roleDefinition);
            const duration = Number(process.hrtime.bigint() - startTime);
            record(DOMAIN.RBAC_DOMAIN, EVENT_TYPES.RBAC_COMPILE_END, EVENT_MTYPES.METRIC_H, duration);
            
            const compileResult = compiler.compile();
            if (compileResult?.code < 0) {
                record(DOMAIN.RBAC_DOMAIN, EVENT_TYPES.RBAC_COMPILE_ERROR, EVENT_MTYPES.METRIC_C);
                return { success: false, ...compileResult };
            }

            const registered = RoleBaseBuckets.registerNewRole(roleName, RoleBinaryWorker);
            if (!registered) {
                return { success: false, code: SYSTEM_STATUS.ROLE_EXISTS, message: 'Role already registered' };
            }

            const instance = RoleBaseBuckets.createRegisterRole(roleName, roleName, compiler);
            if (!instance || instance.code) {
                return { success: false, code: instance?.code || -1, message: instance?.message || 'Failed to create role instance' };
            }

            const roleInit = instance.addRolesValuseToRowBinary();
            if (roleInit?.code !== undefined) {
                return { success: false, ...roleInit };
            }
          
            return { 
                success: true, 
                message: 'Role created successfully',
                roleId: resourceInstance.getRoleId(roleName)
            };
        } catch (error) {
            return { success: false, code: SYSTEM_STATUS.RECOMPILE_FAILED, message: error.message };
        }
    }

    /**
     *  Inspect a compiled role's metadata (useful for debugging/admin panels).
     * @param {string} roleName 
     * @returns {Object|null}
     */
    getRoleInfo(roleName) {
        const roleId = resourceInstance.getRoleId(roleName);
        if (!roleId) return null;

        const worker = RoleBaseBuckets.getInsRegisterRoleByPID(roleId);
        if (!worker) return null;

        return {
            roleName,
            roleId,
            bufferSize: worker.buffer?.length || 0,
            totalBytesSize: worker.striders?.totalBytesSize || 0,
            memberCount: worker.roles?.memberTableMap?.size || 0,
            
        };
    }

    /**
     * Replace an existing role with a new definition (Atomic Hot-Swap).
     * @param {string} roleName 
     * @param {Object} newRoleDefinition 
     * @param {Object} options 
     * @returns {Object}
     */
    updateRole(roleName, newRoleDefinition, options = {}) {
        const result = RoleBaseBuckets.replaceRoleDefinition(roleName, newRoleDefinition, options);
        if (result?.code !== SYSTEM_STATUS.SUCCESS) {
            return { success: false, ...result };
        }
        return { success: true, message: `Group Role '${roleName}' updated successfully` };
    }

    /**
     * Delete a role group by name.
     * - First unregister it by removeing it from active bucketins
     * - second delete it for global resource instances 
     * @param {string} roleName 
     * @returns {Object}
     */
    deleteRole(roleName) {
        const removed = RoleBaseBuckets.removeRegisterRole(roleName);
        if (removed) {
            const RoleDelete=resourceInstance.deleteRolebyName(roleName);
            if (RoleDelete === true)
            return { success: true, message: 'Role deleted successfully' };
        }
        return { success: false, message: 'Role not found or already deleted' };
    }

    /**
     * Check authorization. Returns the packed 32-bit effect integer or an error object.
     */
    checkAccess(roleId, pType, pInstId, cType = null, cInsId = null, gcType = null, gcInsId = null) {
        if (getMonitoring().isEnabled) {
            const start = performance.now();
            const access = this.#authCheck.checkAccess(roleId, pType, pInstId, cType, cInsId, gcType, gcInsId);
            const durationNs = (performance.now() - start) * 1000000;
            record(DOMAIN.RBAC_DOMAIN, EVENT_TYPES.RBAC_AUTH_CHECK, EVENT_MTYPES.METRIC_H, durationNs);
            return access;
        }
        return this.#authCheck.checkAccess(roleId, pType, pInstId, cType, cInsId, gcType, gcInsId);
    }

    // ==========================================
    // Bitwise Decoding Helpers
    // ==========================================
    allowedPrimaryTarget(primaryEffect, targetActionBit) {
        return this.#authCheck.canPerformPrimary(primaryEffect, targetActionBit);
    }

    allowedTargetToOthers(othersEffect, targetActionBit) {
        return this.#authCheck.canPerformOnOthers(othersEffect, targetActionBit);
    }

    allowedOwnerAction(primaryEffect, targetActionBit) {
        const action = this.#authCheck.getPrimaryAction(primaryEffect);
        return ((action & targetActionBit) === targetActionBit);
    }

    allowedOtherAction(primaryEffect, targetActionBit) {
        const action = this.#authCheck.getOthersAction(primaryEffect);
        return ((action & targetActionBit) === targetActionBit);
    }

    getOwnerBoundary(primaryEffect) {
        return this.#authCheck.getPrimaryBoundary(primaryEffect);
    }

    getOtherBoundary(primaryEffect) {
        return this.#authCheck.getOthersBoundary(primaryEffect);
    }

    /**
     * Safely delete a resource instance.
     * @param {string} resourceName 
     * @param {string|number} instanceName 
     * @param {boolean} force - If true, bypasses active role checks (USE WITH CAUTION,for now not used )
     * @returns {Object}
     */
    deleteInstance(resourceName, instanceName, force = false) {
        const parentType = TYPE_IDS[resourceName];
        if (parentType === undefined) {
            return { success: false, code: SYSTEM_STATUS.INVALID_RESOURCE_PID, message: `Invalid Resource Type Name: ${resourceName}` };
        }

        const resIndex = resourceInstance.getResourceInstanceIndex(resourceName, instanceName);
        if (resIndex?.code) {
            return { success: false, code: resIndex.code, message: resIndex.message };
        }

        // maby we using 'force' flag to deletetResourceInstanceIndex in the future, pass it here.
        // For now, it relies on the internal active role check.
        const result = resourceInstance.deletetResourceInstanceIndex(resourceName, instanceName);
        
        if (result === true) {
            return { success: true, message: 'Instance deleted successfully' };
        }
        return result; // Returns the error object from SystemResourcesIntstances
    }

    /**
     * Get all active roles bound to a specific resource instance.
     */
    getRolesBoundToParentInstance(parentTypeName, InsName) {
        const resIndex = resourceInstance.getResourceInstanceIndex(parentTypeName, InsName);
        if (resIndex?.code) {
            return { success: false, code: resIndex.code, message: resIndex.message };
        }
        
        const parentTypePID = TYPE_IDS[parentTypeName];
        const activeRoleIds = RoleBaseBuckets.getActiveRolesForInstance(parentTypePID, resIndex);
        
        if (activeRoleIds.length === 0) {
            return {
                parentIns: InsName,
                numberOfActiveRole: 0,
                activeRolesNames: [],
                unknownRoles: 0
            };
        }
        
        const roles = [];
        let unknownCount = 0;
        
        for (let i = 0; i < activeRoleIds.length; i++) {
            const roleId = activeRoleIds[i];
            const roleName = resourceInstance.getRoleNameById(roleId);
            
            if (roleName === null || roleName?.code !== undefined) {
                unknownCount++;
            } else {
                roles.push(roleName); 
            }
        }
        
        return {
            parentIns: InsName,
            numberOfActiveRole: roles.length, 
            activeRolesNames: roles,
            unknownRoles: unknownCount
        };
    }

    /**
     *  Reset the entire RBAC system (Useful for testing environments).
     */
    reset() {
        RoleBaseBuckets.bucket.clear();
        RoleBaseBuckets.insBucket.clear();
        RoleBaseBuckets.expiredBucket.clear();
        RoleBaseBuckets.instanceToRoles.clear();
        RoleBaseBuckets.cancelPendingFlush();
        
        // Reset resource instances
        resourceInstance.resourcelist = Object.create(null);
        resourceInstance.roleList = Object.create(null);
        resourceInstance.roleList["counter"] = 1;
        
        console.log('[RBAC]  System reset successfully');
    }

    /**
     * Get system-wide RBAC metrics and info.
     * @returns {Object}
     */
    getSystemInfo() {
        return {
            totalActiveRoles: RoleBaseBuckets.insBucket.size,
            expiredBucketSize: RoleBaseBuckets.expiredBucket.size,
            roles: Array.from(RoleBaseBuckets.insBucket.keys()).map(roleId => ({
                roleId,
                roleName: resourceInstance.getRoleNameById(roleId), 
                bufferSize: RoleBaseBuckets.getInsRegisterRoleByPID(roleId)?.buffer?.length || 0
            }))
        };
    }
}

export const rbacManager = new RBACManager();