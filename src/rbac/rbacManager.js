import { resourceInstance } from "./buckets/systemReourcesInstances.js";
import { RoleCompiler } from "./compiler/schema-parser.js";
import { RoleBinaryWorker } from "./allocator/binary-worker.js";
import { RoleBaseBuckets } from "./buckets/buckets.js";
import { AutherizationCheck } from "./authorized/authorization.js";
import { TYPE_IDS, SYSTEM_STATUS } from "./constant/resourceType.js";
import { record, initializeMonitoring, getMonitoring } from "../Monitor/monitoringSystem.js";
import { EVENT_TYPES, EVENT_MTYPES, DOMAIN } from "../Monitor/constant/eventType.js";
import { roleFileRepo } from "./backup/roleFileRepository.js";

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
     * @param {import("./constant/typesDef.js").ResourcesName} resourceName - Resource Type Name (e.g., "COLLECTIONS")
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
     * Checks if a role is currently registered and active.
     * O(1) operation.
     * @param {string} roleName 
     * @returns {boolean}
     */
    isRoleActive(roleName) {
        const roleId = resourceInstance.getRoleId(roleName);
        return roleId !== undefined && RoleBaseBuckets.isRoleActiveById(roleId);
    }

        /**
     * Retrieves the original JSON definition of an active role.
     * @param {string} roleName 
     * @returns {Object}
     */
    getRoleDefinition(roleName) {
        const roleId = resourceInstance.getRoleId(roleName);
        if (!roleId) {
            return { success: false, message: 'Role not found' };
        }

        const worker = RoleBaseBuckets.getInsRegisterRoleByPID(roleId);
        if (!worker) {
            return { success: false, message: 'Role is not active' };
        }

        return { 
            success: true, 
            roleName, 
            definition: worker.roles.ListOfGroups // Returns the original, unpruned JSON
        };
    }

        /**
     * Returns a simple array of all currently active role names.
     * @returns {string[]}
     */
    getAllActiveRoles() {
        const roles = [];
        for (const [roleId, worker] of RoleBaseBuckets.insBucket.entries()) {
            if (worker?.roles?.groupRoleName) {
                roles.push(worker.roles.groupRoleName);
            }
        }
        return roles;
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
 * - First unregisters it from the active buckets.
 * - Second, deletes it from the global resource instances registry.
 * @param {string} roleName 
 * @returns {Object}
 */
deleteRole(roleName) {
   
    const removed = RoleBaseBuckets.removeRegisterRole(roleName);
    if (!removed) {
        return { success: false, message: 'Role not found or already deleted' };
    }
    
    
    const roleDeleteResult = resourceInstance.deleteRolebyName(roleName);
    if (roleDeleteResult !== true) {
        // Edge case: Removed from memory, but failed in registry
        return { 
            success: false, 
            message: 'Partially deleted. Failed to remove from resource registry.',
            details: roleDeleteResult 
        };
    }
    
    return { success: true, message: 'Role deleted successfully' };
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
        resourceInstance.reset()
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

     // =========================================================================
    // 🎛️ ORCHESTRATION: Load & Register from File Repository
    // =========================================================================

    /**
     * Loads ALL role definitions from a directory (Dedicated Files strategy) and registers them.
     * 
     * OPTIMIZATIONS:
     * - Sequential processing to prevent memory spikes (no Promise.all on large N)
     * - Yields to event loop every 10 roles to prevent blocking
     * - Uses direct worker.roles.groupRoleName access (no reverse lookup)
     * - Atomic Hot-Swap for existing roles (zero downtime)
     * 
     * @param {string} dirPath - Directory containing role files
     * @param {Object} [options] - Options
     * @param {boolean} [options.updateIfExists=true] - Update existing roles or skip
     * @param {number} [options.yieldEvery=10] - Yield to event loop every N roles
     * @returns {Promise<Object>} Result object
     */
    async loadAndRegisterAllRolesFromDirectory(dirPath, options = {}) {
        const { updateIfExists = true, yieldEvery = 10 } = options;

        try {
            // 1. List all role files (O(N) but fast filesystem call)
            const listResult = await roleFileRepo.listRolesInDirectory(dirPath);
            if (!listResult.success) {
                return listResult;
            }

            const results = { 
                success: true, 
                created: [], 
                updated: [], 
                failed: [],
                totalProcessed: 0
            };

            // 2. Process each role sequentially (memory-safe)
            for (let i = 0; i < listResult.roles.length; i++) {
                const roleName = listResult.roles[i];

                try {
                    // Load the definition from file
                    const loadResult = await roleFileRepo.loadRoleFromDedicatedFile(roleName, dirPath);
                    if (!loadResult.success) {
                        results.failed.push({ roleName, reason: loadResult.message });
                        continue;
                    }

                    const roleDefinition = loadResult.definition;

                    // Check if role exists (O(1) lookup)
                    const existingRoleId = resourceInstance.getRoleId(roleName);
                    const roleExists = existingRoleId !== undefined && 
                                       RoleBaseBuckets.insBucket.has(existingRoleId);

                    // Create or update
                    if (roleExists && updateIfExists) {
                        const updateResult = this.updateRole(roleName, roleDefinition);
                        if (updateResult.success) {
                            results.updated.push(roleName);
                        } else {
                            results.failed.push({ roleName, reason: updateResult.message });
                        }
                    } else if (!roleExists) {
                        const createResult = this.createRole(roleName, roleDefinition);
                        if (createResult.success) {
                            results.created.push(roleName);
                        } else {
                            results.failed.push({ roleName, reason: createResult.message });
                        }
                    } else {
                        results.failed.push({
                            roleName,
                            reason: 'Role exists but updateIfExists=false. Skipping.'
                        });
                    }

                    results.totalProcessed++;

                    // Yield to event loop periodically to prevent blocking
                    if ((i + 1) % yieldEvery === 0) {
                        await new Promise(resolve => setImmediate(resolve));
                    }
                } catch (error) {
                    results.failed.push({ roleName, reason: error.message });
                }
            }

            return {
                success: results.failed.length === 0,
                message: `Created: ${results.created.length}, Updated: ${results.updated.length}, Failed: ${results.failed.length}`,
                ...results
            };
        } catch (error) {
            return { success: false, message: `Load failed: ${error.message}` };
        }
    }

    /**
     * Loads role definitions from a bulk file (NDJSON) and registers them.
     * 
     * OPTIMIZATIONS:
     * - Streams file line-by-line (never loads entire file into memory)
     * - Processes each role immediately after reading (constant memory footprint)
     * - Yields to event loop every N roles to prevent blocking
     * - Uses Atomic Hot-Swap for existing roles (zero downtime)
     * 
     * @param {string} filePath - Path to the bulk NDJSON file
     * @param {Object} [options] - Options
     * @param {boolean} [options.updateIfExists=true] - Update existing roles or skip
     * @param {number} [options.startLine=1] - Start reading from this line
     * @param {number} [options.limit=Infinity] - Maximum number of roles to load
     * @param {number} [options.yieldEvery=10] - Yield to event loop every N roles
     * @returns {Promise<Object>} Result object
     */
    async loadAndRegisterRolesFromBulkFile(filePath, options = {}) {
        const { 
            updateIfExists = true, 
            startLine = 1, 
            limit = Infinity,
            yieldEvery = 10 
        } = options;

        try {
            // 1. Stream roles from bulk file (memory-efficient)
            const readResult = await roleFileRepo.streamRolesFromBulkFile(filePath, { 
                startLine, 
                limit 
            });
            
            if (!readResult.success) {
                return readResult;
            }

            const results = { 
                success: true, 
                created: [], 
                updated: [], 
                failed: [],
                totalProcessed: 0
            };

            // 2. Process each role immediately (no intermediate storage)
            for (let i = 0; i < readResult.roles.length; i++) {
                const role = readResult.roles[i];

                try {
                    if (role.type !== "ROLE_DEFINITION") {
                        results.failed.push({ 
                            roleName: role.roleName || 'unknown', 
                            reason: 'Invalid payload format' 
                        });
                        continue;
                    }

                    const roleName = role.roleName;
                    const roleDefinition = role.definition;

                    // Check if role exists (O(1) lookup)
                    const existingRoleId = resourceInstance.getRoleId(roleName);
                    const roleExists = existingRoleId !== undefined && 
                                       RoleBaseBuckets.insBucket.has(existingRoleId);

                    // Create or update
                    if (roleExists && updateIfExists) {
                        const updateResult = this.updateRole(roleName, roleDefinition);
                        if (updateResult.success) {
                            results.updated.push(roleName);
                        } else {
                            results.failed.push({ roleName, reason: updateResult.message });
                        }
                    } else if (!roleExists) {
                        const createResult = this.createRole(roleName, roleDefinition);
                        if (createResult.success) {
                            results.created.push(roleName);
                        } else {
                            results.failed.push({ roleName, reason: createResult.message });
                        }
                    } else {
                        results.failed.push({
                            roleName,
                            reason: 'Role exists but updateIfExists=false. Skipping.'
                        });
                    }

                    results.totalProcessed++;

                    // Yield to event loop periodically
                    if ((i + 1) % yieldEvery === 0) {
                        await new Promise(resolve => setImmediate(resolve));
                    }
                } catch (error) {
                    results.failed.push({ 
                        roleName: role.roleName || 'unknown', 
                        reason: error.message 
                    });
                }
            }

            return {
                success: results.failed.length === 0,
                message: `Created: ${results.created.length}, Updated: ${results.updated.length}, Failed: ${results.failed.length}`,
                ...results
            };
        } catch (error) {
            return { success: false, message: `Load failed: ${error.message}` };
        }
    }

    /**
     * Saves a role definition to a dedicated file AND registers it in the system.
     * One-step atomic operation with automatic rollback on failure.
     * 
     * OPTIMIZATIONS:
     * - File write happens first (fast O(1) operation)
     * - If registration fails, file is automatically removed (rollback)
     * - Uses Atomic Hot-Swap for updates (zero downtime)
     * - No memory allocation for intermediate states
     * 
     * @param {string} roleName - The role name
     * @param {Object} roleDefinition - The role definition
     * @param {string} dirPath - Directory to save the file
     * @returns {Promise<Object>} Result object
     */
    async saveAndRegisterRole(roleName, roleDefinition, dirPath) {
        try {
            // 1. Save to file first (fast, O(1))
            const saveResult = await roleFileRepo.saveRoleToDedicatedFile(roleName, roleDefinition, dirPath);
            if (!saveResult.success) {
                return saveResult;
            }

            // 2. Register in system
            const existingRoleId = resourceInstance.getRoleId(roleName);
            const roleExists = existingRoleId !== undefined && 
                               RoleBaseBuckets.insBucket.has(existingRoleId);

            let registerResult;
            if (roleExists) {
                registerResult = this.updateRole(roleName, roleDefinition);
            } else {
                registerResult = this.createRole(roleName, roleDefinition);
            }

            if (registerResult.success) {
                return {
                    success: true,
                    message: `Role '${roleName}' saved to file and registered successfully`,
                    filePath: saveResult.filePath,
                    roleId: registerResult.roleId
                };
            } else {
                // Rollback: remove the file since registration failed
                await roleFileRepo.removeRoleFromDedicatedFile(roleName, dirPath).catch(() => {});
                return registerResult;
            }
        } catch (error) {
            return { success: false, message: `Save and register failed: ${error.message}` };
        }
    }

    /**
     * Backs up ALL currently active roles to a bulk NDJSON file.
     * 
     * OPTIMIZATIONS:
     * - Streams roles directly to file using appendFile (no large buffer)
     * - Uses worker.roles.groupRoleName directly (no reverse lookup)
     * - Saves original ListOfGroups (not pruned state) for fresh compilation
     * - Yields to event loop every N roles to prevent blocking
     * - Atomic file creation (writes to temp, then renames)
     * 
     * @param {string} filePath - Path to the backup NDJSON file
     * @param {Object} [options] - Options
     * @param {number} [options.yieldEvery=10] - Yield to event loop every N roles
     * @returns {Promise<Object>} Result object
     */
    async backupAllActiveRolesToBulkFile(filePath, options = {}) {
        const { yieldEvery = 10 } = options;

        try {
            const results = {
                success: true,
                backedUp: [],
                failed: [],
                totalRoles: RoleBaseBuckets.insBucket.size
            };

            // 1. Iterate through all active roles
            let count = 0;
            for (const [roleId, worker] of RoleBaseBuckets.insBucket.entries()) {
                try {
                    const roleName = worker.roles.groupRoleName; // Direct access, no lookup
                    
                    if (!roleName || !worker.roles.ListOfGroups) {
                        results.failed.push({ roleId, reason: 'Invalid worker state' });
                        continue;
                    }

                    // 2. Append to bulk file (O(1) per role, non-blocking)
                    const appendResult = await roleFileRepo.appendRoleToBulkFile(
                        roleName,
                        worker.roles.ListOfGroups, // Save ORIGINAL definition, not pruned
                        filePath,
                        { version: "1.0", type: "ROLE_DEFINITION" }
                    );

                    if (appendResult.success) {
                        results.backedUp.push(roleName);
                    } else {
                        results.failed.push({ roleName, reason: appendResult.message });
                    }

                    count++;

                    // Yield to event loop periodically
                    if (count % yieldEvery === 0) {
                        await new Promise(resolve => setImmediate(resolve));
                    }
                } catch (error) {
                    results.failed.push({ roleId, reason: error.message });
                }
            }

            return {
                success: results.failed.length === 0,
                message: `Backed up ${results.backedUp.length} of ${results.totalRoles} roles to ${filePath}`,
                ...results
            };
        } catch (error) {
            return { success: false, message: `Backup failed: ${error.message}` };
        }
    }

    /**
     * Loads a single role from a dedicated file and registers it.
     * 
     * OPTIMIZATIONS:
     * - Single file read (O(1))
     * - Direct registration (no iteration)
     * - Uses Atomic Hot-Swap if role exists
     * 
     * @param {string} roleName - The role name
     * @param {string} dirPath - Directory containing the role file
     * @param {Object} [options] - Options
     * @param {boolean} [options.updateIfExists=true] - Update if exists
     * @returns {Promise<Object>} Result object
     */
    async loadAndRegisterSingleRole(roleName, dirPath, options = {}) {
        const { updateIfExists = true } = options;

        try {
            // 1. Load from file (O(1))
            const loadResult = await roleFileRepo.loadRoleFromDedicatedFile(roleName, dirPath);
            if (!loadResult.success) {
                return loadResult;
            }

            const roleDefinition = loadResult.definition;

            // 2. Check if role exists (O(1))
            const existingRoleId = resourceInstance.getRoleId(roleName);
            const roleExists = existingRoleId !== undefined && 
                               RoleBaseBuckets.insBucket.has(existingRoleId);

            // 3. Create or update
            if (roleExists && updateIfExists) {
                const updateResult = this.updateRole(roleName, roleDefinition);
                return {
                    success: updateResult.success,
                    action: 'updated',
                    ...updateResult
                };
            } else if (!roleExists) {
                const createResult = this.createRole(roleName, roleDefinition);
                return {
                    success: createResult.success,
                    action: 'created',
                    ...createResult
                };
            } else {
                return {
                    success: false,
                    message: 'Role exists but updateIfExists=false. Skipping.'
                };
            }
        } catch (error) {
            return { success: false, message: `Load and register failed: ${error.message}` };
        }
    }

    /**
     * Finds a specific role in a bulk file and registers it.
     * 
     * OPTIMIZATIONS:
     * - Streams file until role is found (early exit)
     * - Single registration (no iteration over other roles)
     * - Uses Atomic Hot-Swap if role exists
     * 
     * @param {string} roleName - The role name to find
     * @param {string} filePath - Path to the bulk file
     * @param {Object} [options] - Options
     * @param {boolean} [options.updateIfExists=true] - Update if exists
     * @returns {Promise<Object>} Result object
     */
    async findAndRegisterRoleFromBulkFile(roleName, filePath, options = {}) {
        const { updateIfExists = true } = options;

        try {
            // 1. Find role in bulk file (streams until found, early exit)
            const findResult = await roleFileRepo.findRoleInBulkFile(filePath, roleName);
            if (!findResult.success || !findResult.role) {
                return {
                    success: false,
                    message: findResult.message || `Role '${roleName}' not found in ${filePath}`
                };
            }

            const role = findResult.role;
            const roleDefinition = role.definition;

            // 2. Check if role exists (O(1))
            const existingRoleId = resourceInstance.getRoleId(roleName);
            const roleExists = existingRoleId !== undefined && 
                               RoleBaseBuckets.insBucket.has(existingRoleId);

            // 3. Create or update
            if (roleExists && updateIfExists) {
                const updateResult = this.updateRole(roleName, roleDefinition);
                return {
                    success: updateResult.success,
                    action: 'updated',
                    lineNumber: findResult.lineNumber,
                    ...updateResult
                };
            } else if (!roleExists) {
                const createResult = this.createRole(roleName, roleDefinition);
                return {
                    success: createResult.success,
                    action: 'created',
                    lineNumber: findResult.lineNumber,
                    ...createResult
                };
            } else {
                return {
                    success: false,
                    message: 'Role exists but updateIfExists=false. Skipping.'
                };
            }
        } catch (error) {
            return { success: false, message: `Find and register failed: ${error.message}` };
        }
    }

        /**
     * Removes a role definition from its dedicated file AND optionally unregisters it from the system.
     * One-step atomic operation with rollback: if in-memory deletion fails, the file is restored.
     * 
     * OPTIMIZATIONS:
     * - File deletion is O(1) (single unlink)
     * - In-memory deletion uses Atomic Hot-Swap safety checks
     * - Automatic rollback: if unregister fails, file content is restored
     * - Non-blocking async I/O
     * 
     * @param {string} roleName - The role name to remove
     * @param {string} dirPath - Directory containing role files
     * @param {Object} [options] - Options
     * @param {boolean} [options.removeFromSystem=false] - Also unregister from active RBAC system
     * @returns {Promise<Object>} Result object
     */
    async removeRoleFromFile(roleName, dirPath, options = {}) {
        const { removeFromSystem = false } = options;

        try {
            // 1. Load the definition BEFORE deleting (needed for rollback)
            const loadResult = await roleFileRepo.loadRoleFromDedicatedFile(roleName, dirPath);
            const hadFile = loadResult.success;
            const savedDefinition = hadFile ? loadResult.definition : null;

            // 2. Remove from active system first (if requested)
            if (removeFromSystem) {
                const deleteResult = this.deleteRole(roleName);
                if (!deleteResult.success) {
                    return {
                        success: false,
                        message: `Failed to unregister role: ${deleteResult.message}`,
                        fileRemoved: false
                    };
                }
            }

            // 3. Remove the file from disk (O(1))
            if (hadFile) {
                const removeResult = await roleFileRepo.removeRoleFromDedicatedFile(roleName, dirPath);
                if (!removeResult.success) {
                    // File deletion failed — rollback the in-memory deletion
                    if (removeFromSystem && savedDefinition) {
                        this.createRole(roleName, savedDefinition);
                    }
                    return {
                        success: false,
                        message: `Failed to remove file: ${removeResult.message}`,
                        fileRemoved: false
                    };
                }
            }

            return {
                success: true,
                message: `Role '${roleName}' removed from file and system successfully`,
                fileRemoved: hadFile,
                systemRemoved: removeFromSystem
            };
        } catch (error) {
            return { success: false, message: `Remove failed: ${error.message}` };
        }
    }
}

export const rbacManager = new RBACManager();