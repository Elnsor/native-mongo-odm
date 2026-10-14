import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { mkdir, rm, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { rbacManager } from '../rbac/rbacManager.js';
import { resourceInstance } from '../rbac/buckets/systemReourcesInstances.js';
import { TYPE_IDS, SYSTEM_STATUS, DEFAULT_ACTIONS, BOUNDARY } from '../rbac/constant/resourceType.js';
import { RoleBaseBuckets } from '../rbac/buckets/buckets.js';

describe('RBACManager', () => {
    const testDir = join(tmpdir(), 'rbac-test-' + Date.now());
    
    // Sample role definitions
    const adminRoleDef = {
        "admin_member": {
            "FIELD_METRICS": {
                parentResource: "COLLECTIONS",
                parentInstance: ["users"],
                action: "RWUDA",
                actionToOthers: "RWUDA",
                ownerInstance: ["*"],
                nested: "SEARCH_INDEXES",
                nestedInstance: ["*"]
            }
        }
    };

    const editorRoleDef = {
        "editor_member": {
            "FIELD_METRICS": {
                parentResource: "COLLECTIONS",
                parentInstance: ["users", "products"],
                action: "RWO",
                actionToOthers: "RO",
                ownerInstance: ["mat1", "mat2"],
                nested: "SEARCH_INDEXES",
                nestedInstance: ["sear1"]
            }
        }
    };

    const guestRoleDef = {
        "guest_member": {
            "DOCUMENTS": {
                parentResource: "COLLECTIONS",
                parentInstance: ["*"],
                action: "RO",
                actionToOthers: "NONE",
                ownerInstance: ["*"],
                nested: null,
                nestedInstance: null
            }
        }
    };

    before(async () => {
        await mkdir(testDir, { recursive: true });
    });

    after(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    beforeEach(() => {
        rbacManager.reset();
    });

   // initialization 
    describe('Initialization & Lifecycle', () => {
        it('should initialize successfully', () => {
            const result = rbacManager.initialize({ monitoring: { enabled: false } });
            assert.strictEqual(result, rbacManager);
        });

        it('should warn on double initialization', () => {
            rbacManager.initialize({ monitoring: { enabled: false } });
            const originalWarn = console.warn;
            let warned = false;
            console.warn = () => { warned = true; };
            
            rbacManager.initialize({ monitoring: { enabled: false } });
            
            console.warn = originalWarn;
            assert.strictEqual(warned, true);
        });
    });

   // taxxnonmy test 
    describe('Resource Taxonomy Management', () => {
        it('should register resources successfully', () => {
            const result = rbacManager.registerResource('COLLECTIONS', ['users', 'products']);
            assert.strictEqual(result, true);
            const ins1=resourceInstance.getResourceInstanceIndex("COLLECTIONS",'users')
            const ins2=resourceInstance.getResourceInstanceIndex("COLLECTIONS",'products')
            assert.equal(ins1,0);
            assert.equal(ins2,1);
        });

        it('should fail to register duplicate instance', () => {
            rbacManager.registerResource('COLLECTIONS', ['users']);
            const result = rbacManager.registerResource('COLLECTIONS', ['users']);
            assert.strictEqual(result, false);
        });

        it('should bulk register resources', () => {
            const result = rbacManager.bulkRegisterResources({
                COLLECTIONS: ['users', 'products'],
                FIELD_METRICS: ['mat1', 'mat2'],
                SEARCH_INDEXES: ['sear1'],
                
            });
            assert.strictEqual(result, true);
        });
          it('should fail when register resources that not allowed to have instances like DOCUMENT', () => {
            const result = rbacManager.bulkRegisterResources({
                COLLECTIONS: ['users', 'products'],
                FIELD_METRICS: ['mat1', 'mat2'],
                SEARCH_INDEXES: ['sear1'],
                DOCUMENTS: ['1']
            });
            assert.strictEqual(result, false);
        });

        it('should fail bulk registration if one fails', () => {
            rbacManager.registerResource('COLLECTIONS', ['users']);
            const result = rbacManager.bulkRegisterResources({
                COLLECTIONS: ['users'], // duplicate
                FIELD_METRICS: ['mat1']
            });
            assert.strictEqual(result, false);
        });

        it('should get resource instance index', () => {
            rbacManager.registerResource('COLLECTIONS', ['users', 'products']);
            const idx = rbacManager.getResourceInstanceIndex('COLLECTIONS', 'users');
            assert.strictEqual(typeof idx, 'number');
            assert.strictEqual(idx, 0);
        });

        it('should return error object for non-existent instance', () => {
            rbacManager.registerResource('COLLECTIONS', ['users']);
            const result = rbacManager.getResourceInstanceIndex('COLLECTIONS', 'nonexistent');
            assert.strictEqual(typeof result, 'object');
            assert.strictEqual(result.code, SYSTEM_STATUS.RESOURCE_NOT_FOUND);
        });
    });

    //role lifecycle
    describe('Role Lifecycle Management', () => {
        beforeEach(() => {
            rbacManager.bulkRegisterResources({
                COLLECTIONS: ['users', 'products'],
                FIELD_METRICS: ['mat1', 'mat2'],
                SEARCH_INDEXES: ['sear1'],
                
            });
        });

        it('should validate role definition successfully', () => {
            const result = rbacManager.validateRole('ADMIN', adminRoleDef);
            
            assert.strictEqual(result.success, true);
        });

        it('should fail validation for invalid hierarchy', () => {
            const invalidDef = {
                "member": {
                    "INVALID_RESOURCE": {
                        parentResource: "COLLECTIONS",
                        parentInstance: ["users"],
                        action: "RO",
                        actionToOthers: "NONE",
                        ownerInstance: ["*"]
                    }
                }
            };
            const result = rbacManager.validateRole('TEST', invalidDef);
            assert.strictEqual(result.success, false);
        });

        it('should create role successfully', () => {
            const result = rbacManager.createRole('ADMIN', adminRoleDef);
            assert.strictEqual(result.success, true);
            assert.strictEqual(typeof result.roleId, 'number');
        });

        it('should fail to create duplicate role', () => {
            rbacManager.createRole('ADMIN', adminRoleDef);
            const result = rbacManager.createRole('ADMIN', adminRoleDef);
            assert.strictEqual(result.success, false);
            assert.strictEqual(result.code, SYSTEM_STATUS.RECOMPILE_FAILED); // becouse exist role triger error when construct role class
        });

        it('should update role successfully (atomic hot-swap)', () => {
            rbacManager.createRole('ADMIN', adminRoleDef);
            const updatedDef = {
                "admin_member": {
                    "FIELD_METRICS": {
                        parentResource: "COLLECTIONS",
                        parentInstance: ["users", "products"], // added products
                        action: "RWUDA",
                        actionToOthers: "RWUDA",
                        ownerInstance: ["*"],
                        nested: "SEARCH_INDEXES",
                        nestedInstance: ["*"]
                    }
                }
            };
            const result = rbacManager.updateRole('ADMIN', updatedDef);
            
            assert.strictEqual(result.success, true);
        });

        it('should fail to update non-existent role', () => {
            const result = rbacManager.updateRole('NONEXISTENT', adminRoleDef);
            assert.strictEqual(result.success, false);
        });

        it('should delete role successfully', () => {
            rbacManager.createRole('ADMIN', adminRoleDef);
            const result = rbacManager.deleteRole('ADMIN');
            assert.strictEqual(result.success, true);
        });

        it('should fail to delete non-existent role', () => {
            const result = rbacManager.deleteRole('NONEXISTENT');
            assert.strictEqual(result.success, false);
        });
    });

   // role debugging
    describe('Role Introspection & Debugging', () => {
        beforeEach(() => {
            rbacManager.bulkRegisterResources({
                COLLECTIONS: ['users', 'products'],
                FIELD_METRICS: ['mat1', 'mat2'],
                SEARCH_INDEXES: ['sear1'],
              
            });
            rbacManager.createRole('ADMIN', adminRoleDef);
            rbacManager.createRole('EDITOR', editorRoleDef);
        });

        it('should check if role is active', () => {
            assert.strictEqual(rbacManager.isRoleActive('ADMIN'), true);
            assert.strictEqual(rbacManager.isRoleActive('NONEXISTENT'), false);
        });

        it('should get role definition', () => {
            const result = rbacManager.getRoleDefinition('ADMIN');
            assert.strictEqual(result.success, true);
            assert.deepStrictEqual(result.definition, adminRoleDef);
        });

        it('should fail to get non-existent role definition', () => {
            const result = rbacManager.getRoleDefinition('NONEXISTENT');
            assert.strictEqual(result.success, false);
        });

        it('should get all active roles', () => {
            const roles = rbacManager.getAllActiveRoles();
            assert.strictEqual(roles.length, 2);
            assert.ok(roles.includes('ADMIN'));
            assert.ok(roles.includes('EDITOR'));
        });

        it('should get role info', () => {
            const info = rbacManager.getRoleInfo('ADMIN');
            assert.ok(info);
            assert.strictEqual(info.roleName, 'ADMIN');
            assert.strictEqual(typeof info.roleId, 'number');
            assert.strictEqual(typeof info.bufferSize, 'number');
            assert.strictEqual(typeof info.totalBytesSize, 'number');
        });

        it('should return null for non-existent role info', () => {
            const info = rbacManager.getRoleInfo('NONEXISTENT');
            assert.strictEqual(info, null);
        });

        it('should get system info', () => {
            const info = rbacManager.getSystemInfo();
            assert.strictEqual(info.totalActiveRoles, 2);
            assert.strictEqual(typeof info.expiredBucketSize, 'number');
            assert.strictEqual(info.roles.length, 2);
        });
    });

    // autherization and effected action bits 
    describe('Authorization & Bitwise Decoding', () => {
        let adminRoleId;

        beforeEach(() => {
            rbacManager.bulkRegisterResources({
                COLLECTIONS: ['users', 'products'],
                FIELD_METRICS: ['mat1', 'mat2'],
                SEARCH_INDEXES: ['sear1'],
                
            });
            const result = rbacManager.createRole('ADMIN', adminRoleDef);
            adminRoleId = result.roleId;
        });

        it('should check access successfully', () => {
            const pType = TYPE_IDS.COLLECTIONS;
            const pInstId = 0; // users
            const cType = TYPE_IDS.SEARCH_INDEXES;
            const cInsId = 0; // sear1
            const gcType = TYPE_IDS.FIELD_METRICS;
            const gcInsId = 0; // mat1

            const effect = rbacManager.checkAccess(adminRoleId, pType, pInstId, cType, cInsId, gcType, gcInsId);
            assert.strictEqual(typeof effect, 'number');
        });

        it('should return access denied for not exist roleid when checkAccess role', () => {
            const effect = rbacManager.checkAccess(999, TYPE_IDS.COLLECTIONS, 0);
            assert.strictEqual(typeof effect, 'object');
            assert.strictEqual(effect.code, SYSTEM_STATUS.ACCESS_DENIED); // its access denied code not role not found 
        });

        it('should decode primary target action', () => {
            const effect = rbacManager.checkAccess(adminRoleId, TYPE_IDS.COLLECTIONS, 0, TYPE_IDS.SEARCH_INDEXES, 0, TYPE_IDS.FIELD_METRICS, 0);
            const canRead = rbacManager.allowedPrimaryTarget(effect, DEFAULT_ACTIONS.READ);
            const canWrite = rbacManager.allowedPrimaryTarget(effect, DEFAULT_ACTIONS.WRITE);
            assert.strictEqual(canRead, true);
            assert.strictEqual(canWrite, true);
        });

        it('should decode others target action', () => {
            const effect = rbacManager.checkAccess(adminRoleId, TYPE_IDS.COLLECTIONS, 0, TYPE_IDS.SEARCH_INDEXES, 0, TYPE_IDS.FIELD_METRICS, 0);
            const canRead = rbacManager.allowedTargetToOthers(effect, DEFAULT_ACTIONS.READ);
            assert.strictEqual(canRead, true);
        });

        it('should get owner boundary', () => {
            const effect = rbacManager.checkAccess(adminRoleId, TYPE_IDS.COLLECTIONS, 0,TYPE_IDS.SEARCH_INDEXES, 0, TYPE_IDS.FIELD_METRICS, 0);
            const boundary = rbacManager.getOwnerBoundary(effect);
            assert.strictEqual(boundary, BOUNDARY.ALL);
        });

        it('should get other boundary', () => {
            const effect = rbacManager.checkAccess(adminRoleId, TYPE_IDS.COLLECTIONS, 0, TYPE_IDS.SEARCH_INDEXES, 0, TYPE_IDS.FIELD_METRICS, 0);
            const boundary = rbacManager.getOtherBoundary(effect);
            assert.strictEqual(boundary, BOUNDARY.ALL);
        });
    });

    // system status safety 
    describe('System Safety & Management', () => {
        beforeEach(() => {
            rbacManager.bulkRegisterResources({
                COLLECTIONS: ['users', 'products'],
                FIELD_METRICS: ['mat1', 'mat2'],
                SEARCH_INDEXES: ['sear1'],
             
            });
            rbacManager.createRole('ADMIN', adminRoleDef);
        });

        it('should delete instance successfully when not bound to role', () => {
            const result = rbacManager.deleteInstance('COLLECTIONS', 'products');
            assert.strictEqual(result.success, true);
        });

        it('should fail to delete instance bound to active role', () => {
            const result = rbacManager.deleteInstance('COLLECTIONS', 'users');
            assert.strictEqual(result.success, false);
            assert.ok(result.message.includes('Active role'));
        });

        it('should get roles bound to parent instance', () => {
            const result = rbacManager.getRolesBoundToParentInstance('COLLECTIONS', 'users');
            assert.strictEqual(result.numberOfActiveRole, 1);
            
            assert.ok(result.activeRolesNames.includes('ADMIN'));
        });

        it('should return empty array for instance with no roles', () => {
            const result = rbacManager.getRolesBoundToParentInstance('COLLECTIONS', 'products');
            assert.strictEqual(result.numberOfActiveRole, 0);
        });

        it('should reset system successfully', () => {
            rbacManager.reset();
            const info = rbacManager.getSystemInfo();
            assert.strictEqual(info.totalActiveRoles, 0);
        });
    });

    //Roles wiht file repository Managment 
    describe('File Repository Orchestration', () => {
        const rolesDir = join(testDir, 'roles');
        const bulkFile = join(testDir, 'bulk.ndjson');

        beforeEach(async () => {
            rbacManager.bulkRegisterResources({
                COLLECTIONS: ['users', 'products'],
                FIELD_METRICS: ['mat1', 'mat2'],
                SEARCH_INDEXES: ['sear1'],
             
            });
        });

        it('should save and register role successfully', async () => {
            const result = await rbacManager.saveAndRegisterRole('ADMIN', adminRoleDef, rolesDir);
            assert.strictEqual(result.success, true);
            assert.ok(result.filePath);
            assert.strictEqual(typeof result.roleId, 'number');
        });

        it('should rollback file on registration failure', async () => {
              await rm(testDir, { recursive: true, force: true });
              await mkdir(testDir, { recursive: true});

            const invalidDef = {
                "member": {
                    "INVALID_RESOURCE": {
                        parentResource: "COLLECTIONS",
                        parentInstance: ["users"],
                        action: "RO",
                        actionToOthers: "NONE",
                        ownerInstance: ["*"]
                    }
                }
            };
            const result = await rbacManager.saveAndRegisterRole('INVALID', invalidDef, rolesDir);
            assert.strictEqual(result.success, false);
            
            
            // Verify file was rolled back
            const roles = await rbacManager.loadAndRegisterAllRolesFromDirectory(rolesDir);
            assert.strictEqual(roles.created.length, 0);
        });

        it('should load and register all roles from directory', async () => {
            await rbacManager.saveAndRegisterRole('ADMIN', adminRoleDef, rolesDir);
            await rbacManager.saveAndRegisterRole('EDITOR', editorRoleDef, rolesDir);
            
            rbacManager.reset();
            rbacManager.bulkRegisterResources({
                COLLECTIONS: ['users', 'products'],
                FIELD_METRICS: ['mat1', 'mat2'],
                SEARCH_INDEXES: ['sear1'],
               
            });

            const result = await rbacManager.loadAndRegisterAllRolesFromDirectory(rolesDir);
            assert.strictEqual(result.success, true);
            assert.strictEqual(result.created.length, 2);
        });

        it('should backup all active roles to bulk file', async () => {
            rbacManager.createRole('ADMIN', adminRoleDef);
            rbacManager.createRole('EDITOR', editorRoleDef);

            const result = await rbacManager.backupAllActiveRolesToBulkFile(bulkFile);
            assert.strictEqual(result.success, true);
            assert.strictEqual(result.backedUp.length, 2);

            // Verify file content
            const content = await readFile(bulkFile, 'utf-8');
            const lines = content.trim().split('\n');
            assert.strictEqual(lines.length, 2);
        });

        it('should load and register roles from bulk file', async () => {
            rbacManager.reset();
                  rbacManager.bulkRegisterResources({
                COLLECTIONS: ['users', 'products'],
                FIELD_METRICS: ['mat1', 'mat2'],
                SEARCH_INDEXES: ['sear1'],
             
            });
            rbacManager.createRole('ADMIN', adminRoleDef);
            rbacManager.createRole('EDITOR', editorRoleDef);
            await rbacManager.backupAllActiveRolesToBulkFile(bulkFile);

            rbacManager.reset();
            rbacManager.bulkRegisterResources({
                COLLECTIONS: ['users', 'products'],
                FIELD_METRICS: ['mat1', 'mat2'],
                SEARCH_INDEXES: ['sear1'],
             
            });

            const result = await rbacManager.loadAndRegisterRolesFromBulkFile(bulkFile);
            assert.strictEqual(result.success, true);
            assert.strictEqual(result.created.length, 2);
        });

        it('should load and register single role', async () => {
            await rbacManager.saveAndRegisterRole('ADMIN', adminRoleDef, rolesDir);
            
            rbacManager.reset();
            rbacManager.bulkRegisterResources({
                COLLECTIONS: ['users', 'products'],
                FIELD_METRICS: ['mat1', 'mat2'],
                SEARCH_INDEXES: ['sear1'],
               
            });

            const result = await rbacManager.loadAndRegisterSingleRole('ADMIN', rolesDir);
            assert.strictEqual(result.success, true);
            assert.strictEqual(result.action, 'created');
        });

        it('should find and register role from bulk file', async () => {
            rbacManager.createRole('ADMIN', adminRoleDef);
            rbacManager.createRole('EDITOR', editorRoleDef);
            await rbacManager.backupAllActiveRolesToBulkFile(bulkFile);

            rbacManager.reset();
            rbacManager.bulkRegisterResources({
                COLLECTIONS: ['users', 'products'],
                FIELD_METRICS: ['mat1', 'mat2'],
                SEARCH_INDEXES: ['sear1'],
             
            });

            const result = await rbacManager.findAndRegisterRoleFromBulkFile('ADMIN', bulkFile);
            assert.strictEqual(result.success, true);
            assert.strictEqual(result.action, 'created');
            assert.strictEqual(typeof result.lineNumber, 'number');
        });

        it('should fail to find non-existent role in bulk file', async () => {
            rbacManager.createRole('ADMIN', adminRoleDef);
            await rbacManager.backupAllActiveRolesToBulkFile(bulkFile);

            const result = await rbacManager.findAndRegisterRoleFromBulkFile('NONEXISTENT', bulkFile);
            assert.strictEqual(result.success, false);
        });
    });

   //edg cases
    describe('Edge Cases & Error Handling', () => {
        it('should handle empty role definition', () => {
            const result = rbacManager.validateRole('EMPTY', {});
            
            assert.strictEqual(result.success, false);
        });

        it('should handle role with no members', () => {
            const result = rbacManager.validateRole('NOMEMBER', { "": {} });
            
            assert.strictEqual(result.success, false);
        });

        it('should handle role with invalid action notation', () => {
            const invalidDef = {
                "member": {
                    "FIELD_METRICS": {
                        parentResource: "COLLECTIONS",
                        parentInstance: ["users"],
                        action: "INVALID_ACTION",
                        actionToOthers: "NONE",
                        ownerInstance: ["*"]
                    }
                }
            };
            const result = rbacManager.validateRole('INVALID', invalidDef);
            assert.strictEqual(result.success, false);
        });

        it('should handle wildcard mixed with specific instances', () => {
            const invalidDef = {
                "member": {
                    "FIELD_METRICS": {
                        parentResource: "COLLECTIONS",
                        parentInstance: ["users", "*"],
                        action: "RO",
                        actionToOthers: "NONE",
                        ownerInstance: ["*"]
                    }
                }
            };
            const result = rbacManager.validateRole('INVALID', invalidDef);
            assert.strictEqual(result.success, false);
        });

        it('should handle checkAccess with null grandchild', () => {
            rbacManager.bulkRegisterResources({
                COLLECTIONS: ['users'],
              
            });
            const result = rbacManager.createRole('GUEST', guestRoleDef);
            const effect = rbacManager.checkAccess(result.roleId, TYPE_IDS.COLLECTIONS, 0, TYPE_IDS.DOCUMENTS, 0);
            assert.strictEqual(typeof effect, 'number');
        });

        it('should handle bulk file with pagination', async () => {
               rbacManager.reset();
            rbacManager.bulkRegisterResources({
                COLLECTIONS: ['users', 'products'],
                FIELD_METRICS: ['mat1', 'mat2'],
                SEARCH_INDEXES: ['sear1'],
            
            });
            const bulkFile = join(testDir, 'pagination.ndjson');
            rbacManager.createRole('ADMIN', adminRoleDef);
            rbacManager.createRole('EDITOR', editorRoleDef);
            rbacManager.createRole('GUEST', guestRoleDef);
            
            await rbacManager.backupAllActiveRolesToBulkFile(bulkFile);

            rbacManager.reset();
            rbacManager.bulkRegisterResources({
                COLLECTIONS: ['users', 'products'],
                FIELD_METRICS: ['mat1', 'mat2'],
                SEARCH_INDEXES: ['sear1'],
            
            });

            const result = await rbacManager.loadAndRegisterRolesFromBulkFile(bulkFile, {
                startLine: 1,
                limit: 2
            });
            assert.strictEqual(result.success, true);
            
            assert.strictEqual(result.created.length, 2);
        });
    });
});

console.log('✅ RBACManager test suite loaded. Run with: node --test RBACManager.test.js');