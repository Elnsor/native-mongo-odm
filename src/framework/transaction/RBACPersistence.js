import { BasePersistence } from "../../framework/transaction/BasePersistence.js";
import { AppError } from "../../framework/appError.js";

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
}

// Export singleton instance
export const rbacPersistence = new RBACPersistence();