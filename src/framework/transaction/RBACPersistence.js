import { BasePersistence } from "../../framework/transaction/BasePersistence.js";
import { AppError } from "../../framework/appError.js";
import { resourceInstance } from "../../rbac/buckets/systemReourcesInstances.js";
import { RoleCompiler } from "../../rbac/compiler/schema-parser.js";
import { RoleBaseBuckets } from "../../rbac/buckets/buckets.js";

export class RBACPersistence extends BasePersistence {
    constructor() {
        super({
            collectionName: "rbac_roles",
            eventsCollectionName: "rbac_role_events", // Enables Event Sourcing for RBAC
            enableEventSourcing: true 
        });
    }

    /**
     * Loads all active roles from MongoDB for bootstrapping.
     * @returns {Promise<Array>} Array of role documents
     */
    async loadAllActiveRoles() {
        const result = await this.loadAll({ status: "active" });
        
        if (!result.success) {
            throw new AppError("RBAC Persistence Error: Failed to load active roles from DB", 500);
        }
        
        return result.data;
    }

     /**
     * Recovers and rebuilds the entire in-memory RBAC engine.
     * Call this ONCE during server startup.
     */
   async recoverAndRebuildRBAC() {
        console.log("🔄 [RBAC] Starting recovery and rebuild of in-memory state...");
        const roles = await this.loadAllActiveRoles();
        
        let successCount = 0;
        let failCount = 0;

        for (const roleDoc of roles) {
            try {
                const { roleName, roleDefinition } = roleDoc;

                //  Ensure the role name is registered in the global taxonomy
                // (If it fails because it exists, that's fine, we just need the ID)
                resourceInstance.AddRole(roleName);
                const roleId = resourceInstance.getRoleId(roleName);

                // Compile the role definition into a fresh compiler
                const compiler = new RoleCompiler(roleName, roleDefinition);
                const compileResult = compiler.compile();

                if (compileResult !== true) {
                    console.error(`❌ [RBAC] Compilation failed for role '${roleName}':`, compileResult);
                    failCount++;
                    continue;
                }

                //  Register and instantiate the binary worker
                RoleBaseBuckets.registerNewRole(roleName, RoleBinaryWorker);
                const worker = RoleBaseBuckets.createRegisterRole(roleName, roleName, compiler);
                
                // 4. Write to the final binary buffer
                worker.addRolesValuseToRowBinary();
                successCount++;

            } catch (error) {
                console.error(`❌ [RBAC] Critical error rebuilding role '${roleDoc.roleName}':`, error);
                failCount++;
            }
        }

        console.log(`✅ [RBAC] Recovery complete: ${successCount} roles rebuilt successfully. (${failCount} failed)`);
        
        if (failCount > 0) {
            throw new AppError(`RBAC Recovery Partial Failure: ${failCount} roles failed to compile. Check logs.`, 500);
        }

        return true;
    }
    /**
     * Helper to save a role with a default 'active' status
     */
    async saveRole(roleName, roleDefinition, userContext = { role: ["SYSTEM"] }) {
        return this.save(
            {
                roleName,
                roleDefinition,
                status: "active",
                metadata: { description: `Role ${roleName}` }
            },
            { userContext }
        );
    }

async deactivateRole(roleName, userContext = { role: ["SYSTEM"] }) {
    return this.update(
    { roleName, status: "active" },
    { $set: { status: "inactive", deactivatedAt: new Date() } },
    { userContext }
    );
}
}

// Export singleton instance
export const rbacPersistence = new RBACPersistence();