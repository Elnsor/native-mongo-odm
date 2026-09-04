import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { securityRulesEngine } from '../framework/engines/SecurityRulesEngine.js'
import { SchemaBuilder } from '../framework/SchemaBuilder.js';
import { applicationSchemaRegistry } from '../framework/applicationSchemaRegistry.js';
import { frameworkConfig } from '../config/frameworkConfig.js';

describe("Unit Test: SecurityRulesEngine", () => {

    beforeEach(() => {
        frameworkConfig.schemaDefaults.auotLoadingRegisterSchema = true;
        if (applicationSchemaRegistry.isRegister("restrictedProfiles")) {
            applicationSchemaRegistry.unregister("restrictedProfiles");
        }
    });

    it("should enforce restricted roles and block unauthorized modifications", async () => {
        const builder = new SchemaBuilder("restrictedProfiles")
            .string({ 
                name: "roleTier", 
                config: { 
                    required: true, 
                    nullable: false,
                    restrictedRoles: ["admin", "superadmin"]  
                } 
            });

        applicationSchemaRegistry.register("restrictedProfiles", builder);

        const payload = { roleTier: "superadmin" };
        const currentDoc = { roleTier: "user" };
        const userContextRole = { role: ["regular_user"] };

        await assert.rejects(async () => {
            await securityRulesEngine.evalRoles("restrictedProfiles", payload, currentDoc, userContextRole, true);
        }, /Security Exception: Unauthorized access to modify privileged restricted field 'roleTier'\./);
    });

    it("should allow modification of restricted fields if user context matches required role", async () => {
        const builder = new SchemaBuilder("restrictedProfiles")
            .string({ 
                name: "roleTier", 
                config: { 
                    required: true, 
                    nullable: false,
                    appRoles: { restrictedRoles: ["admin", "superadmin"] } 
                } 
            });

        applicationSchemaRegistry.register("restrictedProfiles", builder);

        const payload = { roleTier: "admin" };
        const currentDoc = { roleTier: "user" };
        const userContextRole = { role: ["admin"] };

        const result = await securityRulesEngine.evalRoles("restrictedProfiles", payload, currentDoc, userContextRole, true);
        assert.strictEqual(result.roleTier, "admin");
    });

    it("should enforce immutability rules and block changes to immutable fields on update", async () => {
        const builder = new SchemaBuilder("restrictedProfiles")
            .string({ 
                name: "systemId", 
                config: { 
                    required: true, 
                    nullable: false,
                    immutable: true  
                } 
            });

        applicationSchemaRegistry.register("restrictedProfiles", builder);

        const payload = { systemId: "NEW_ID_999" };
        const currentDoc = { systemId: "ORIGINAL_ID_123" };
        const userContextRole = { role: ["admin"] };

        await assert.rejects(async () => {
            await securityRulesEngine.evalRoles("restrictedProfiles", payload, currentDoc, userContextRole, true);
        }, /Security Error: Not allowed to modefied immutable Field "systemId"/);
    });

    it("should Mange CreatedAt and UpdatedAt by system",async ()=>{
         const builder = new SchemaBuilder("restrictedProfiles")
            .string({ 
                name: "systemId", 
                config: { 
                    required: true, 
                    nullable: false,
                    immutable: true  
                } 
            }).withTimestamps();

             applicationSchemaRegistry.register("restrictedProfiles", builder);
              const payload = { systemId: "NEW_ID_999" };
     
        const userContextRole = { role: ["admin"] };

        const sanitized=await securityRulesEngine.evalRoles("restrictedProfiles", payload, null, userContextRole, false)
      

              assert.ok(sanitized.createdAt instanceof Date);
              assert.ok(sanitized.updatedAt instanceof Date);


    })
});