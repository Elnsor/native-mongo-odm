import { SchemaBuilder } from "../../framework/SchemaBuilder.js";

/**
 * Defines the schema for storing RBAC roles in MongoDB.
 */
export function defineRbacRoleSchema() {
    const builder = new SchemaBuilder("rbac_roles");

    builder
        // Role Name (Unique, Immutable identifier)
        .string({
            name: "roleName",
            attrs: { 
                minLength: 2, 
                maxLength: 50, 
                pattern: "^[A-Z0-9_]+$" // e.g., ADMIN, MANAGER
            },
            config: { 
                required: true, 
                immutable: true 
            }
        })
        
        // The actual JSON definition that gets compiled into binary
        .object({
            name: "roleDefinition",
            attrs: { description: "The raw JSON role definition" },
            config: { required: true }
        })

        // Status (active, inactive, archived)
        .string({
            name: "status",
            attrs: { enum: ["active", "inactive", "archived"] },
            config: { required: true }
        })

        // Optional metadata (description, creator, etc.)
        .object({
            name: "metadata",
            config: { required: false, nullable: true }
        })

        // Standard Framework Features
        .withTimestamps()
        .withVersionConcurrencyControl()
        
        // Indexes for fast querying
        .index({ roleName: 1 }, { unique: true })
        .index({ status: 1 });

    return builder;
}

/**
 * Defines the schema for RBAC Event Sourcing (Audit trail for role changes)
 */
export function defineRbacEventSchema() {
    const builder = new SchemaBuilder("rbac_role_events");

    builder
        .string({ name: "eventType", attrs: { enum: ["ROLE_CREATED", "ROLE_UPDATED", "ROLE_DELETED"] }, config: { required: true } })
        .string({ name: "roleName", config: { required: true } })
        .object({ name: "previousDefinition", config: { required: false, nullable: true } })
        .object({ name: "newDefinition", config: { required: false, nullable: true } })
        .string({ name: "actor", config: { required: true } })
        .time({ name: "timestamp", config: { required: true } })
        .object({ name: "metadata", config: { required: false } })
        .withTimestamps()
        .index({ roleName: 1, timestamp: -1 })
        .index({ eventType: 1 });

    return builder;
}