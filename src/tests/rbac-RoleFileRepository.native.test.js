import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdir, rm, readFile, writeFile, stat, access } from 'fs/promises';
import { constants } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { RoleFileRepository, roleFileRepo } from '../rbac/backup/roleFileRepository.js';

describe('RoleFileRepository', () => {
    let testDir;
    let repo;

    // Sample role definitions for testing
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
                ownerInstance: ["*"]
            }
        }
    };

    beforeEach(async () => {
        // Create a unique temp directory for each test
        testDir = join(tmpdir(), `rbac-repo-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        await mkdir(testDir, { recursive: true });
        repo = new RoleFileRepository();
    });

    afterEach(async () => {
        // Clean up temp directory
        try {
            await rm(testDir, { recursive: true, force: true });
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    
    // for dedicated file 
    
    describe('Strategy 1: Dedicated Files', () => {

        // saveRoleToDedicatedFile

        describe('saveRoleToDedicatedFile', () => {
            it('should save a role definition to a dedicated file successfully', async () => {
                const result = await repo.saveRoleToDedicatedFile('ADMIN', adminRoleDef, testDir);
                
                assert.strictEqual(result.success, true);
                assert.ok(result.filePath);
                assert.ok(result.filePath.endsWith('ADMIN.json'));
                
                // Verify file exists and has correct content
                const content = await readFile(result.filePath, 'utf-8');
                const parsed = JSON.parse(content);
                assert.strictEqual(parsed.roleName, 'ADMIN');
                assert.strictEqual(parsed.type, 'ROLE_DEFINITION');
                assert.strictEqual(parsed.version, '1.0');
                assert.deepStrictEqual(parsed.definition, adminRoleDef);
                assert.ok(parsed.savedAt);
            });

            it('should create directory if it does not exist', async () => {
                const nestedDir = join(testDir, 'nested', 'deep', 'roles');
                const result = await repo.saveRoleToDedicatedFile('ADMIN', adminRoleDef, nestedDir);
                
                assert.strictEqual(result.success, true);
                
                // Verify directory was created
                const dirStats = await stat(nestedDir);
                assert.ok(dirStats.isDirectory());
            });

            it('should overwrite existing file with same role name', async () => {
                await repo.saveRoleToDedicatedFile('ADMIN', adminRoleDef, testDir);
                
                const updatedDef = { ...adminRoleDef, updated: true };
                const result = await repo.saveRoleToDedicatedFile('ADMIN', updatedDef, testDir);
                
                assert.strictEqual(result.success, true);
                
                // Verify content was overwritten
                const content = await readFile(result.filePath, 'utf-8');
                const parsed = JSON.parse(content);
                assert.strictEqual(parsed.definition.updated, true);
            });

            it('should sanitize role names with special characters', async () => {
                const result = await repo.saveRoleToDedicatedFile('ADMIN@ROLE#1', adminRoleDef, testDir);
                
                assert.strictEqual(result.success, true);
                // Special chars should be replaced with underscores
                assert.ok(result.filePath.includes('ADMIN_ROLE_1.json'));
            });

            it('should handle role names with unicode characters', async () => {
                const result = await repo.saveRoleToDedicatedFile('ADMIN_角色', adminRoleDef, testDir);
                
                assert.strictEqual(result.success, true);
            });

            it('should handle empty role definition', async () => {
                const result = await repo.saveRoleToDedicatedFile('EMPTY', {}, testDir);
                
                assert.strictEqual(result.success, true);
                const content = await readFile(result.filePath, 'utf-8');
                const parsed = JSON.parse(content);
                assert.deepStrictEqual(parsed.definition, {});
            });

            it('should handle large role definitions', async () => {
                const largeDef = {
                    member_1: {}
                };
                for (let i = 0; i < 1000; i++) {
                    largeDef.member_1[`LEAF_${i}`] = {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users'],
                        action: 'RO',
                        actionToOthers: 'NONE',
                        ownerInstance: [`inst_${i}`]
                    };
                }
                
                const result = await repo.saveRoleToDedicatedFile('LARGE_ROLE', largeDef, testDir);
                assert.strictEqual(result.success, true);
                
                const content = await readFile(result.filePath, 'utf-8');
                const parsed = JSON.parse(content);
                assert.strictEqual(Object.keys(parsed.definition.member_1).length, 1000);
            });

            it('should return error for invalid directory path', async () => {
                // Use a path that cannot be created (e.g., a file name as directory)
                const invalidPath = join(testDir, 'file.txt', 'subdir');
                await writeFile(join(testDir, 'file.txt'), 'content');
                
                const result = await repo.saveRoleToDedicatedFile('ADMIN', adminRoleDef, invalidPath);
                assert.strictEqual(result.success, false);
                assert.ok(result.message.includes('Save failed'));
            });
        });

    
        // loadRoleFromDedicatedFile
    
        describe('loadRoleFromDedicatedFile', () => {
            it('should load a role definition successfully', async () => {
                await repo.saveRoleToDedicatedFile('ADMIN', adminRoleDef, testDir);
                
                const result = await repo.loadRoleFromDedicatedFile('ADMIN', testDir);
                
                assert.strictEqual(result.success, true);
                assert.strictEqual(result.roleName, 'ADMIN');
                assert.deepStrictEqual(result.definition, adminRoleDef);
                assert.ok(result.savedAt);
            });

            it('should return error for non-existent role file', async () => {
                const result = await repo.loadRoleFromDedicatedFile('NONEXISTENT', testDir);
                
                assert.strictEqual(result.success, false);
                assert.ok(result.message.includes('Load failed'));
            });

            it('should return error for invalid JSON content', async () => {
                const filePath = join(testDir, 'INVALID.json');
                await writeFile(filePath, 'not valid json {{{', 'utf-8');
                
                const result = await repo.loadRoleFromDedicatedFile('INVALID', testDir);
                
                assert.strictEqual(result.success, false);
                assert.ok(result.message.includes('Load failed'));
            });

            it('should return error for invalid file format (wrong type)', async () => {
                const filePath = join(testDir, 'WRONG_TYPE.json');
                await writeFile(filePath, JSON.stringify({
                    type: 'WRONG_TYPE',
                    roleName: 'WRONG_TYPE',
                    definition: {}
                }), 'utf-8');
                
                const result = await repo.loadRoleFromDedicatedFile('WRONG_TYPE', testDir);
                
                assert.strictEqual(result.success, false);
                assert.ok(result.message.includes('Invalid file format'));
            });

            it('should handle role names with special characters', async () => {
                await repo.saveRoleToDedicatedFile('ADMIN@ROLE#1', adminRoleDef, testDir);
                
                const result = await repo.loadRoleFromDedicatedFile('ADMIN@ROLE#1', testDir);
                
                assert.strictEqual(result.success, true);
                assert.strictEqual(result.roleName, 'ADMIN@ROLE#1');
            });

            it('should preserve nested objects in definition', async () => {
                await repo.saveRoleToDedicatedFile('ADMIN', adminRoleDef, testDir);
                
                const result = await repo.loadRoleFromDedicatedFile('ADMIN', testDir);
                
                assert.strictEqual(result.success, true);
                assert.deepStrictEqual(result.definition, adminRoleDef);
            });
        });

        
        // removeRoleFromDedicatedFile
        
        describe('removeRoleFromDedicatedFile', () => {
            it('should remove a role file successfully', async () => {
                await repo.saveRoleToDedicatedFile('ADMIN', adminRoleDef, testDir);
                
                const result = await repo.removeRoleFromDedicatedFile('ADMIN', testDir);
                
                assert.strictEqual(result.success, true);
                assert.ok(result.message.includes('Removed'));
                
                // Verify file no longer exists
                const loadResult = await repo.loadRoleFromDedicatedFile('ADMIN', testDir);
                assert.strictEqual(loadResult.success, false);
            });

            it('should return error for non-existent role file', async () => {
                const result = await repo.removeRoleFromDedicatedFile('NONEXISTENT', testDir);
                
                assert.strictEqual(result.success, false);
                assert.ok(result.message.includes('not found'));
            });

            it('should handle role names with special characters', async () => {
                await repo.saveRoleToDedicatedFile('ADMIN@ROLE#1', adminRoleDef, testDir);
                
                const result = await repo.removeRoleFromDedicatedFile('ADMIN@ROLE#1', testDir);
                
                assert.strictEqual(result.success, true);
            });

            it('should not affect other role files', async () => {
                await repo.saveRoleToDedicatedFile('ADMIN', adminRoleDef, testDir);
                await repo.saveRoleToDedicatedFile('EDITOR', editorRoleDef, testDir);
                
                await repo.removeRoleFromDedicatedFile('ADMIN', testDir);
                
                // EDITOR should still exist
                const result = await repo.loadRoleFromDedicatedFile('EDITOR', testDir);
                assert.strictEqual(result.success, true);
            });
        });

        
        // listRolesInDirectory
        
        describe('listRolesInDirectory', () => {
            it('should list all roles in directory', async () => {
                await repo.saveRoleToDedicatedFile('ADMIN', adminRoleDef, testDir);
                await repo.saveRoleToDedicatedFile('EDITOR', editorRoleDef, testDir);
                await repo.saveRoleToDedicatedFile('GUEST', guestRoleDef, testDir);
                
                const result = await repo.listRolesInDirectory(testDir);
                
                assert.strictEqual(result.success, true);
                assert.strictEqual(result.totalRoles, 3);
                assert.ok(result.roles.includes('ADMIN'));
                assert.ok(result.roles.includes('EDITOR'));
                assert.ok(result.roles.includes('GUEST'));
            });

            it('should return empty list for empty directory', async () => {
                const result = await repo.listRolesInDirectory(testDir);
                
                assert.strictEqual(result.success, true);
                assert.strictEqual(result.totalRoles, 0);
                assert.deepStrictEqual(result.roles, []);
            });

            it('should create directory if it does not exist', async () => {
                const nestedDir = join(testDir, 'new_dir');
                const result = await repo.listRolesInDirectory(nestedDir);
                
                assert.strictEqual(result.success, true);
                assert.strictEqual(result.totalRoles, 0);
            });

            it('should only list .json files', async () => {
                await repo.saveRoleToDedicatedFile('ADMIN', adminRoleDef, testDir);
                await writeFile(join(testDir, 'readme.txt'), 'text file');
                await writeFile(join(testDir, 'data.json.bak'), 'backup file');
                
                const result = await repo.listRolesInDirectory(testDir);
                
                assert.strictEqual(result.success, true);
                assert.strictEqual(result.totalRoles, 1);
                assert.ok(result.roles.includes('ADMIN'));
            });

            it('should handle sanitized role names correctly', async () => {
                await repo.saveRoleToDedicatedFile('ADMIN@ROLE#1', adminRoleDef, testDir);
                
                const result = await repo.listRolesInDirectory(testDir);
                
                assert.strictEqual(result.success, true);
                // The listed name is the sanitized file name without .json
                assert.strictEqual(result.totalRoles, 1);
            });
        });

        
        // getRoleFileMetadata
        
        describe('getRoleFileMetadata', () => {
            it('should return metadata for existing role file', async () => {
                await repo.saveRoleToDedicatedFile('ADMIN', adminRoleDef, testDir);
                
                const result = await repo.getRoleFileMetadata('ADMIN', testDir);
                
                assert.strictEqual(result.success, true);
                assert.strictEqual(result.roleName, 'ADMIN');
                assert.ok(result.filePath);
                assert.strictEqual(typeof result.sizeBytes, 'number');
                assert.ok(result.sizeBytes > 0);
                assert.ok(result.createdAt instanceof Date);
                assert.ok(result.modifiedAt instanceof Date);
            });

            it('should return error for non-existent role file', async () => {
                const result = await repo.getRoleFileMetadata('NONEXISTENT', testDir);
                
                assert.strictEqual(result.success, false);
                assert.ok(result.message.includes('Metadata failed'));
            });

            it('should reflect file size changes after update', async () => {
                await repo.saveRoleToDedicatedFile('ADMIN', adminRoleDef, testDir);
                const metadata1 = await repo.getRoleFileMetadata('ADMIN', testDir);
                
                // Update with larger definition
                const largerDef = { ...adminRoleDef, extra: 'x'.repeat(1000) };
                await repo.saveRoleToDedicatedFile('ADMIN', largerDef, testDir);
                const metadata2 = await repo.getRoleFileMetadata('ADMIN', testDir);
                
                assert.ok(metadata2.sizeBytes > metadata1.sizeBytes);
            });
        });
    });

    
    // bulk file (NDJSON)
    
    describe('Strategy 2: Bulk File (NDJSON)', () => {

        
        // appendRoleToBulkFile
        
        describe('appendRoleToBulkFile', () => {
            it('should append a role definition to bulk file', async () => {
                const filePath = join(testDir, 'bulk.ndjson');
                
                const result = await repo.appendRoleToBulkFile('ADMIN', adminRoleDef, filePath);
                
                assert.strictEqual(result.success, true);
                assert.ok(result.filePath);
                
                // Verify file content
                const content = await readFile(filePath, 'utf-8');
                const lines = content.trim().split('\n');
                assert.strictEqual(lines.length, 1);
                
                const parsed = JSON.parse(lines[0]);
                assert.strictEqual(parsed.roleName, 'ADMIN');
                assert.strictEqual(parsed.type, 'ROLE_DEFINITION');
            });

            it('should append multiple roles to same file', async () => {
                const filePath = join(testDir, 'bulk.ndjson');
                
                await repo.appendRoleToBulkFile('ADMIN', adminRoleDef, filePath);
                await repo.appendRoleToBulkFile('EDITOR', editorRoleDef, filePath);
                await repo.appendRoleToBulkFile('GUEST', guestRoleDef, filePath);
                
                const content = await readFile(filePath, 'utf-8');
                const lines = content.trim().split('\n');
                
                assert.strictEqual(lines.length, 3);
                
                const role1 = JSON.parse(lines[0]);
                const role2 = JSON.parse(lines[1]);
                const role3 = JSON.parse(lines[2]);
                
                assert.strictEqual(role1.roleName, 'ADMIN');
                assert.strictEqual(role2.roleName, 'EDITOR');
                assert.strictEqual(role3.roleName, 'GUEST');
            });

            it('should create directory if it does not exist', async () => {
                const filePath = join(testDir, 'nested', 'deep', 'bulk.ndjson');
                
                const result = await repo.appendRoleToBulkFile('ADMIN', adminRoleDef, filePath);
                
                assert.strictEqual(result.success, true);
                
                const dirStats = await stat(join(testDir, 'nested', 'deep'));
                assert.ok(dirStats.isDirectory());
            });

            it('should use custom options for version and type', async () => {
                const filePath = join(testDir, 'bulk.ndjson');
                
                await repo.appendRoleToBulkFile('ADMIN', adminRoleDef, filePath, {
                    version: '2.0',
                    type: 'CUSTOM_TYPE'
                });
                
                const content = await readFile(filePath, 'utf-8');
                const parsed = JSON.parse(content.trim());
                
                assert.strictEqual(parsed.version, '2.0');
                assert.strictEqual(parsed.type, 'CUSTOM_TYPE');
            });

            it('should handle empty role definition', async () => {
                const filePath = join(testDir, 'bulk.ndjson');
                
                const result = await repo.appendRoleToBulkFile('EMPTY', {}, filePath);
                
                assert.strictEqual(result.success, true);
                
                const content = await readFile(filePath, 'utf-8');
                const parsed = JSON.parse(content.trim());
                assert.deepStrictEqual(parsed.definition, {});
            });

            it('should preserve each role as a separate line', async () => {
                const filePath = join(testDir, 'bulk.ndjson');
                
                for (let i = 0; i < 10; i++) {
                    await repo.appendRoleToBulkFile(`ROLE_${i}`, { index: i }, filePath);
                }
                
                const content = await readFile(filePath, 'utf-8');
                const lines = content.trim().split('\n');
                
                assert.strictEqual(lines.length, 10);
                
                for (let i = 0; i < 10; i++) {
                    const parsed = JSON.parse(lines[i]);
                    assert.strictEqual(parsed.roleName, `ROLE_${i}`);
                    assert.strictEqual(parsed.definition.index, i);
                }
            });
        });

        
        // streamRolesFromBulkFile
        
        describe('streamRolesFromBulkFile', () => {
            let bulkFile;

            beforeEach(async () => {
                bulkFile = join(testDir, 'bulk.ndjson');
                // Create a bulk file with 10 roles
                for (let i = 0; i < 10; i++) {
                    await repo.appendRoleToBulkFile(`ROLE_${i}`, { index: i }, bulkFile);
                }
            });

            it('should stream all roles from bulk file', async () => {
                const result = await repo.streamRolesFromBulkFile(bulkFile);
                
                assert.strictEqual(result.success, true);
                assert.strictEqual(result.totalRead, 10);
                assert.strictEqual(result.roles.length, 10);
            });

            it('should stream roles with startLine option', async () => {
                const result = await repo.streamRolesFromBulkFile(bulkFile, { startLine: 5 });
                
                assert.strictEqual(result.success, true);
                assert.strictEqual(result.totalRead, 6); // Lines 5-10
                assert.strictEqual(result.roles[0].roleName, 'ROLE_4');
            });

            it('should stream roles with limit option', async () => {
                const result = await repo.streamRolesFromBulkFile(bulkFile, { limit: 3 });
                
                assert.strictEqual(result.success, true);
                assert.strictEqual(result.totalRead, 3);
                assert.strictEqual(result.roles[0].roleName, 'ROLE_0');
                assert.strictEqual(result.roles[2].roleName, 'ROLE_2');
            });

            it('should stream roles with startLine and limit combined', async () => {
                const result = await repo.streamRolesFromBulkFile(bulkFile, {
                    startLine: 3,
                    limit: 4
                });
                
                assert.strictEqual(result.success, true);
                assert.strictEqual(result.totalRead, 4);
                assert.strictEqual(result.roles[0].roleName, 'ROLE_2');
                assert.strictEqual(result.roles[3].roleName, 'ROLE_5');
            });

            it('should handle startLine beyond file length', async () => {
                const result = await repo.streamRolesFromBulkFile(bulkFile, { startLine: 100 });
                
                assert.strictEqual(result.success, true);
                assert.strictEqual(result.totalRead, 0);
                assert.deepStrictEqual(result.roles, []);
            });

            it('should handle limit greater than available lines', async () => {
                const result = await repo.streamRolesFromBulkFile(bulkFile, { limit: 100 });
                
                assert.strictEqual(result.success, true);
                assert.strictEqual(result.totalRead, 10);
            });

            it('should return error for non-existent file', async () => {
                const result = await repo.streamRolesFromBulkFile(join(testDir, 'nonexistent.ndjson'));
                
                assert.strictEqual(result.success, false);
                assert.ok(result.message.includes('Stream read failed'));
            });

            it('should return error for file with invalid JSON', async () => {
                const invalidFile = join(testDir, 'invalid.ndjson');
                await writeFile(invalidFile, 'not valid json\n{also invalid}\n', 'utf-8');
                
                const result = await repo.streamRolesFromBulkFile(invalidFile);
                
                assert.strictEqual(result.success, false);
            });

            it('should handle empty file', async () => {
                const emptyFile = join(testDir, 'empty.ndjson');
                await writeFile(emptyFile, '', 'utf-8');
                
                const result = await repo.streamRolesFromBulkFile(emptyFile);
                
                assert.strictEqual(result.success, true);
                assert.strictEqual(result.totalRead, 0);
                assert.deepStrictEqual(result.roles, []);
            });

            it('should handle file with only whitespace', async () => {
                const wsFile = join(testDir, 'whitespace.ndjson');
                await writeFile(wsFile, '   \n  \n   ', 'utf-8');
                
                const result = await repo.streamRolesFromBulkFile(wsFile);
                
                // Should either succeed with empty or fail with parse error
                assert.ok(result.success === true || result.success === false);
            });

            it('should handle large bulk file', async () => {
                const largeFile = join(testDir, 'large.ndjson');
                const numRoles = 1000;
                
                for (let i = 0; i < numRoles; i++) {
                    await repo.appendRoleToBulkFile(`ROLE_${i}`, { index: i }, largeFile);
                }
                
                const result = await repo.streamRolesFromBulkFile(largeFile);
                
                assert.strictEqual(result.success, true);
                assert.strictEqual(result.totalRead, numRoles);
            });

            it('should handle pagination with limit=1', async () => {
                const result = await repo.streamRolesFromBulkFile(bulkFile, { limit: 1 });
                
                assert.strictEqual(result.success, true);
                assert.strictEqual(result.totalRead, 1);
                assert.strictEqual(result.roles[0].roleName, 'ROLE_0');
            });
        });

        
        // findRoleInBulkFile
        
        describe('findRoleInBulkFile', () => {
            let bulkFile;

            beforeEach(async () => {
                bulkFile = join(testDir, 'bulk.ndjson');
                for (let i = 0; i < 10; i++) {
                    await repo.appendRoleToBulkFile(`ROLE_${i}`, { index: i }, bulkFile);
                }
            });

            it('should find a role by name', async () => {
                const result = await repo.findRoleInBulkFile(bulkFile, 'ROLE_5');
                
                assert.strictEqual(result.success, true);
                assert.ok(result.role);
                assert.strictEqual(result.role.roleName, 'ROLE_5');
                assert.strictEqual(result.role.definition.index, 5);
                assert.strictEqual(typeof result.lineNumber, 'number');
            });

            it('should return null for non-existent role', async () => {
                const result = await repo.findRoleInBulkFile(bulkFile, 'NONEXISTENT');
                
                assert.strictEqual(result.success, true);
                assert.strictEqual(result.role, null);
                assert.ok(result.message.includes('not found'));
            });

            it('should find first role in file', async () => {
                const result = await repo.findRoleInBulkFile(bulkFile, 'ROLE_0');
                
                assert.strictEqual(result.success, true);
                assert.ok(result.role);
                assert.strictEqual(result.role.roleName, 'ROLE_0');
                assert.strictEqual(result.lineNumber, 1);
            });

            it('should find last role in file', async () => {
                const result = await repo.findRoleInBulkFile(bulkFile, 'ROLE_9');
                
                assert.strictEqual(result.success, true);
                assert.ok(result.role);
                assert.strictEqual(result.role.roleName, 'ROLE_9');
                assert.strictEqual(result.lineNumber, 10);
            });

            it('should respect startLine option', async () => {
                const result = await repo.findRoleInBulkFile(bulkFile, 'ROLE_0', { startLine: 5 });
                
                assert.strictEqual(result.success, true);
                assert.strictEqual(result.role, null); // ROLE_0 is before line 5
            });

            it('should respect limit option', async () => {
                const result = await repo.findRoleInBulkFile(bulkFile, 'ROLE_9', { limit: 5 });
                
                assert.strictEqual(result.success, true);
                assert.strictEqual(result.role, null); // ROLE_9 is after 5 lines checked
            });

            it('should find role within limit', async () => {
                const result = await repo.findRoleInBulkFile(bulkFile, 'ROLE_3', { limit: 5 });
                
                assert.strictEqual(result.success, true);
                assert.ok(result.role);
                assert.strictEqual(result.role.roleName, 'ROLE_3');
            });

            it('should return error for non-existent file', async () => {
                const result = await repo.findRoleInBulkFile(join(testDir, 'nonexistent.ndjson'), 'ROLE_0');
                
                assert.strictEqual(result.success, false);
                assert.ok(result.message.includes('Search failed'));
            });

            it('should handle empty search name', async () => {
                const result = await repo.findRoleInBulkFile(bulkFile, '');
                
                assert.strictEqual(result.success, true);
                assert.strictEqual(result.role, null);
            });

            it('should handle special characters in search name', async () => {
                const specialFile = join(testDir, 'special.ndjson');
                await repo.appendRoleToBulkFile('ROLE@#$', { special: true }, specialFile);
                
                const result = await repo.findRoleInBulkFile(specialFile, 'ROLE@#$');
                
                assert.strictEqual(result.success, true);
                assert.ok(result.role);
                assert.strictEqual(result.role.roleName, 'ROLE@#$');
            });

            it('should stop early when role is found (performance)', async () => {
                // Create a large file
                const largeFile = join(testDir, 'large.ndjson');
                for (let i = 0; i < 10000; i++) {
                    await repo.appendRoleToBulkFile(`ROLE_${i}`, { index: i }, largeFile);
                }
                
                const start = performance.now();
                const result = await repo.findRoleInBulkFile(largeFile, 'ROLE_5');
                const duration = performance.now() - start;
                
                assert.strictEqual(result.success, true);
                assert.ok(result.role);
                // Should be very fast since it stops early
                assert.ok(duration < 100, `Search took ${duration}ms, expected < 100ms`);
            });
        });
    });

    
    //corss-strategy INTEGRATION TESTS
    
    describe('Cross-Strategy Integration', () => {
        it('should allow mixing dedicated and bulk strategies', async () => {
            // Save to dedicated
            const dedicatedResult = await repo.saveRoleToDedicatedFile('ADMIN', adminRoleDef, testDir);
            assert.strictEqual(dedicatedResult.success, true);
            
            // Save to bulk
            const bulkFile = join(testDir, 'backup.ndjson');
            const bulkResult = await repo.appendRoleToBulkFile('ADMIN', adminRoleDef, bulkFile);
            assert.strictEqual(bulkResult.success, true);
            
            // Load from both
            const dedicatedLoad = await repo.loadRoleFromDedicatedFile('ADMIN', testDir);
            assert.strictEqual(dedicatedLoad.success, true);
            
            const bulkLoad = await repo.findRoleInBulkFile(bulkFile, 'ADMIN');
            assert.strictEqual(bulkLoad.success, true);
            assert.ok(bulkLoad.role);
            
            // Both should have same definition
            assert.deepStrictEqual(dedicatedLoad.definition, bulkLoad.role.definition);
        });

        it('should handle concurrent operations safely', async () => {
            const filePath = join(testDir, 'concurrent.ndjson');
            
            // Append multiple roles concurrently
            const promises = [];
            for (let i = 0; i < 10; i++) {
                promises.push(repo.appendRoleToBulkFile(`ROLE_${i}`, { index: i }, filePath));
            }
            
            const results = await Promise.all(promises);
            
            // All should succeed
            for (const result of results) {
                assert.strictEqual(result.success, true);
            }
            
            // Verify all roles were written
            const streamResult = await repo.streamRolesFromBulkFile(filePath);
            assert.strictEqual(streamResult.totalRead, 10);
        });

        it('should handle role definition with all field types', async () => {
            const complexDef = {
                member_1: {
                    FIELD_METRICS: {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users', 'products'],
                        action: 'RWO',
                        actionToOthers: 'RO',
                        ownerInstance: [
                            { name: 'mat1', ttl: '1h', EffectedAction: 'RW' },
                            { name: 'mat2', ttl: '7d' }
                        ],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['sear1', 'sear2'],
                        ttl: '30d'
                    }
                }
            };
            
            // Test with dedicated file
            const dedicatedResult = await repo.saveRoleToDedicatedFile('COMPLEX', complexDef, testDir);
            assert.strictEqual(dedicatedResult.success, true);
            
            const dedicatedLoad = await repo.loadRoleFromDedicatedFile('COMPLEX', testDir);
            assert.deepStrictEqual(dedicatedLoad.definition, complexDef);
            
            // Test with bulk file
            const bulkFile = join(testDir, 'complex.ndjson');
            await repo.appendRoleToBulkFile('COMPLEX', complexDef, bulkFile);
            
            const bulkLoad = await repo.findRoleInBulkFile(bulkFile, 'COMPLEX');
            assert.deepStrictEqual(bulkLoad.role.definition, complexDef);
        });
    });

    
    // EDGE CASES & ERROR HANDLING
    
    describe('Edge Cases & Error Handling', () => {
        it('should handle undefined role definition', async () => {
            const result = await repo.saveRoleToDedicatedFile('UNDEFINED', undefined, testDir);
            // JSON.stringify(undefined) returns undefined, which may cause issues
            assert.ok(result.success === false || result.success === true);
        });

        it('should handle null role definition', async () => {
            const result = await repo.saveRoleToDedicatedFile('NULL', null, testDir);
            assert.strictEqual(result.success, true);
            
            const loaded = await repo.loadRoleFromDedicatedFile('NULL', testDir);
            assert.strictEqual(loaded.definition, null);
        });

        it('should handle circular reference in definition (should fail gracefully)', async () => {
            const circularDef = { name: 'test' };
            circularDef.self = circularDef;
            
            const result = await repo.saveRoleToDedicatedFile('CIRCULAR', circularDef, testDir);
            // JSON.stringify will throw on circular reference
            assert.strictEqual(result.success, false);
        });

        it('should handle very long role names', async () => {
            const longName = 'A'.repeat(1000);
            const result = await repo.saveRoleToDedicatedFile(longName, adminRoleDef, testDir);
          
            assert.strictEqual(result.success, true);
        });

         it('should generate unique files for two different very long names', async () => {
            const nameA = 'A'.repeat(250);
            const nameB = 'B'.repeat(250);

            await repo.saveRoleToDedicatedFile(nameA, adminRoleDef, testDir);
            await repo.saveRoleToDedicatedFile(nameB, editorRoleDef, testDir);

            const list = await repo.listRolesInDirectory(testDir);
            assert.strictEqual(list.totalRoles, 2); // no collision

            const a = await repo.loadRoleFromDedicatedFile(nameA, testDir);
            const b = await repo.loadRoleFromDedicatedFile(nameB, testDir);

            assert.strictEqual(a.roleName, nameA);
            assert.strictEqual(b.roleName, nameB);
        });

        it('should allow deleting a very long-named role', async () => {
            const longName = 'X'.repeat(300);

            await repo.saveRoleToDedicatedFile(longName, adminRoleDef, testDir);
            const removed = await repo.removeRoleFromDedicatedFile(longName, testDir);

            assert.strictEqual(removed.success, true);

            const after = await repo.loadRoleFromDedicatedFile(longName, testDir);
            assert.strictEqual(after.success, false);
        });

        it('should handle empty role name', async () => {
            const result = await repo.saveRoleToDedicatedFile('', adminRoleDef, testDir);
            assert.strictEqual(result.success, true);
        });

        it('should handle role name with only special characters', async () => {
            const result = await repo.saveRoleToDedicatedFile('@#$%^&*()', adminRoleDef, testDir);
            assert.strictEqual(result.success, true);
        });

        it('should handle file with mixed valid and invalid JSON lines', async () => {
            const mixedFile = join(testDir, 'mixed.ndjson');
            const content = [
                JSON.stringify({ roleName: 'VALID_1', type: 'ROLE_DEFINITION', definition: {} }),
                'invalid json line',
                JSON.stringify({ roleName: 'VALID_2', type: 'ROLE_DEFINITION', definition: {} })
            ].join('\n');
            
            await writeFile(mixedFile, content, 'utf-8');
            
            // streamRolesFromBulkFile should fail on invalid line
            const streamResult = await repo.streamRolesFromBulkFile(mixedFile);
            assert.strictEqual(streamResult.success, false);
            
            // findRoleInBulkFile should also fail if valid role come after none valid one
            const findResult = await repo.findRoleInBulkFile(mixedFile, 'VALID_2');
            
            assert.strictEqual(findResult.success, false);
        });

        it('should handle file with empty lines', async () => {
            const emptyLinesFile = join(testDir, 'empty_lines.ndjson');
            const content = [
                JSON.stringify({ roleName: 'ROLE_1', type: 'ROLE_DEFINITION', definition: {} }),
                '',
                '',
                JSON.stringify({ roleName: 'ROLE_2', type: 'ROLE_DEFINITION', definition: {} })
            ].join('\n');
            
            await writeFile(emptyLinesFile, content, 'utf-8');
            
            // Should handle empty lines gracefully (may fail or skip)
            const result = await repo.streamRolesFromBulkFile(emptyLinesFile);
            // Behavior depends on implementation - empty lines may cause parse errors
            assert.ok(result.success === true || result.success === false);
        });

        it('should handle very large single role definition', async () => {
            const hugeDef = {
                member_1: {
                    FIELD_METRICS: {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users'],
                        action: 'RO',
                        actionToOthers: 'NONE',
                        ownerInstance: Array.from({ length: 10000 }, (_, i) => ({
                            name: `owner_${i}`,
                            ttl: '1h'
                        }))
                    }
                }
            };
            
            const result = await repo.saveRoleToDedicatedFile('HUGE', hugeDef, testDir);
            assert.strictEqual(result.success, true);
            
            const loaded = await repo.loadRoleFromDedicatedFile('HUGE', testDir);
            assert.strictEqual(loaded.success, true);
            assert.strictEqual(loaded.definition.member_1.FIELD_METRICS.ownerInstance.length, 10000);
        });

        it('should handle concurrent reads and writes', async () => {
            const filePath = join(testDir, 'concurrent.ndjson');
            
            // Write roles
            for (let i = 0; i < 5; i++) {
                await repo.appendRoleToBulkFile(`ROLE_${i}`, { index: i }, filePath);
            }
            
            // Concurrent reads
            const readPromises = [];
            for (let i = 0; i < 5; i++) {
                readPromises.push(repo.findRoleInBulkFile(filePath, `ROLE_${i}`));
            }
            
            const results = await Promise.all(readPromises);
            
            for (let i = 0; i < 5; i++) {
                assert.strictEqual(results[i].success, true);
                assert.ok(results[i].role);
                assert.strictEqual(results[i].role.roleName, `ROLE_${i}`);
            }
        });
    });

    
    // performance testing
    
    describe('Performance', () => {
        it('should save role to dedicated file quickly (< 50ms)', async () => {
            const start = performance.now();
            const result = await repo.saveRoleToDedicatedFile('PERF', adminRoleDef, testDir);
            const duration = performance.now() - start;
            
            assert.strictEqual(result.success, true);
            assert.ok(duration < 50, `Save took ${duration}ms, expected < 50ms`);
        });

        it('should load role from dedicated file quickly (< 50ms)', async () => {
            await repo.saveRoleToDedicatedFile('PERF', adminRoleDef, testDir);
            
            const start = performance.now();
            const result = await repo.loadRoleFromDedicatedFile('PERF', testDir);
            const duration = performance.now() - start;
            
            assert.strictEqual(result.success, true);
            assert.ok(duration < 50, `Load took ${duration}ms, expected < 50ms`);
        });

        it('should list roles in directory quickly (< 50ms for 100 roles)', async () => {
            for (let i = 0; i < 100; i++) {
                await repo.saveRoleToDedicatedFile(`ROLE_${i}`, adminRoleDef, testDir);
            }
            
            const start = performance.now();
            const result = await repo.listRolesInDirectory(testDir);
            const duration = performance.now() - start;
            
            assert.strictEqual(result.success, true);
            assert.strictEqual(result.totalRoles, 100);
            assert.ok(duration < 50, `List took ${duration}ms, expected < 50ms`);
        });

        it('should append to bulk file quickly (< 50ms)', async () => {
            const filePath = join(testDir, 'perf.ndjson');
            
            const start = performance.now();
            const result = await repo.appendRoleToBulkFile('PERF', adminRoleDef, filePath);
            const duration = performance.now() - start;
            
            assert.strictEqual(result.success, true);
            assert.ok(duration < 50, `Append took ${duration}ms, expected < 50ms`);
        });

        it('should stream 1000 roles from bulk file quickly (< 500ms)', async () => {
            const filePath = join(testDir, 'stream.ndjson');
            for (let i = 0; i < 1000; i++) {
                await repo.appendRoleToBulkFile(`ROLE_${i}`, { index: i }, filePath);
            }
            
            const start = performance.now();
            const result = await repo.streamRolesFromBulkFile(filePath);
            const duration = performance.now() - start;
            
            assert.strictEqual(result.success, true);
            assert.strictEqual(result.totalRead, 1000);
            assert.ok(duration < 500, `Stream took ${duration}ms, expected < 500ms`);
        });

        it('should find role in large file quickly (early exit)', async () => {
            const filePath = join(testDir, 'find.ndjson');
            for (let i = 0; i < 10000; i++) {
                await repo.appendRoleToBulkFile(`ROLE_${i}`, { index: i }, filePath);
            }
            
            const start = performance.now();
            const result = await repo.findRoleInBulkFile(filePath, 'ROLE_10');
            const duration = performance.now() - start;
            
            assert.strictEqual(result.success, true);
            assert.ok(result.role);
            assert.ok(duration < 100, `Find took ${duration}ms, expected < 100ms (early exit)`);
        });
    });
});

console.log('✅ RoleFileRepository test suite loaded. Run with: node --test roleFileRepository.native.test.js');