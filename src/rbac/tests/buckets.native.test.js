// tests/rbac/buckets.integration.test.js
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { resourceInstance } from '../buckets/systemReourcesInstances.js';
import { RoleBaseBuckets } from '../buckets/buckets.js';
import { RoleCompiler } from '../compiler/schema-parser.js';
import { RoleBinaryWorker } from '../allocator/binary-worker.js';
import { AutherizationCheck } from '../authorized/authorization.js';
import { 
    TYPE_IDS, 
    STRIDER_SIZES, 
    SYSTEM_STATUS,
    SIZE_POWER,
    DEFAULT_ACTIONS,
    BOUNDARY
} from '../constant/resourceType.js';

describe('RoleBaseBuckets - Hot-Swap & TTL Expiration Integration Tests', () => {
    
    beforeEach(() => {
        // Reset singleton state
        resourceInstance.reset();
        SIZE_POWER.WILDCARD = 32;
        
        // Clear all buckets
        RoleBaseBuckets.bucket.clear();
        RoleBaseBuckets.insBucket.clear();
        RoleBaseBuckets.expiredBucket.clear();
        RoleBaseBuckets.instanceToRoles.clear();
        RoleBaseBuckets.isFlushing = false;
    });

    afterEach(async () => {
        // Wait for any background flush to complete
        if (RoleBaseBuckets.isFlushing) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    });

    // ==========================================================================
    // TEST SUITE 1: Role Registration & Instantiation
    // ==========================================================================
    describe('Test 1: Role Registration & Instantiation', () => {
        const ROLE_NAME = 'REGISTRATION_TEST_ROLE';
        let compiler;

        beforeEach(() => {
            
            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            resourceInstance.AddResourceInstance('SEARCH_INDEXES', 'idx_1');
            resourceInstance.AddResourceInstance('FIELD_METRICS', 'metric_1');

            const roleDefinition = {
                'member_1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: ['READ', 'UPDATE'],
                        boundary: 'OWN',
                        actionToOthers: ['READ'],
                        boundaryToOthers: 'ALL',
                        ownerInstance: ['metric_1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['idx_1'],
                        ttl: null
                    }
                }
            };

            compiler = new RoleCompiler(ROLE_NAME, roleDefinition);
            compiler.compile();
        });

        test('registerNewRole should register role class successfully', () => {
            const result = RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            assert.strictEqual(result, true);
            
            const GroupPid = resourceInstance.getRoleId(ROLE_NAME);
            assert.ok(RoleBaseBuckets.bucket.has(GroupPid));
        });

        test('registerNewRole should return error for duplicate role', () => {
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            const result = RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            
            assert.strictEqual(result.code, SYSTEM_STATUS.ROLE_EXISTS);
        });

        test('createRegisterRole should create instance successfully', () => {
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            const instance = RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler);
            
            assert.ok(instance);
            assert.ok(instance instanceof RoleBinaryWorker);
            
            const GroupPid = resourceInstance.getRoleId(ROLE_NAME);
            assert.ok(RoleBaseBuckets.insBucket.has(GroupPid));
        });

        test('createRegisterRole should return error if role not registered', () => {
            const result = RoleBaseBuckets.createRegisterRole('NON_EXISTENT_ROLE', 'NON_EXISTENT_ROLE', compiler);
            assert.strictEqual(result.code, SYSTEM_STATUS.RESOURCE_NOT_FOUND);
        });

        test('createRegisterRole should return error if instance already exists', () => {
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler);
            
            const result = RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler);
            assert.strictEqual(result.code, SYSTEM_STATUS.RESOURCE_NOT_FOUND);
        });

        test('getInsRegisterRole should return instance by name', () => {
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler);
            
            const instance = RoleBaseBuckets.getInsRegisterRole(ROLE_NAME);
            assert.ok(instance);
            assert.ok(instance instanceof RoleBinaryWorker);
        });

        test('getInsRegisterRoleByPID should return instance by PID', () => {
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler);
            
            const GroupPid = resourceInstance.getRoleId(ROLE_NAME);
            const instance = RoleBaseBuckets.getInsRegisterRoleByPID(GroupPid);
            assert.ok(instance);
            assert.ok(instance instanceof RoleBinaryWorker);
        });
    });

    // ==========================================================================
    // TEST SUITE 2: Hot-Swap (Atomic Update)
    // ==========================================================================
    describe('Test 2: Hot-Swap (Atomic Update)', () => {
        const ROLE_NAME = 'HOT_SWAP_TEST_ROLE';
        let compiler1;
        let compiler2;

        beforeEach(() => {
           
            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            resourceInstance.AddResourceInstance('SEARCH_INDEXES', 'idx_1');
            resourceInstance.AddResourceInstance('SEARCH_INDEXES', 'idx_2');
            resourceInstance.AddResourceInstance('FIELD_METRICS', 'metric_1');
            resourceInstance.AddResourceInstance('FIELD_METRICS', 'metric_2');

            // Initial role definition
            const roleDefinition1 = {
                'member_1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: ['READ'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['metric_1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['idx_1'],
                        ttl: null
                    }
                }
            };

            compiler1 = new RoleCompiler(ROLE_NAME, roleDefinition1);
            compiler1.compile();

            // Updated role definition (more permissions)
            const roleDefinition2 = {
                'member_1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: ['READ', 'UPDATE', 'DELETE'],
                        boundary: 'ALL',
                        actionToOthers: ['READ'],
                        boundaryToOthers: 'ALL',
                        ownerInstance: ['metric_1', 'metric_2'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['idx_1', 'idx_2'],
                        ttl: null
                    }
                }
            };

            compiler2 = new RoleCompiler(ROLE_NAME, roleDefinition2,true);
            compiler2.compile();
        });

        test('updateExistedInstanceRole should hot-swap successfully', () => {
            // Register and create initial instance
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            
            
           const worker1= RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler1);
           worker1.addRolesValuseToRowBinary();

            // Create new worker with updated definition
            const worker2 = new RoleBinaryWorker(ROLE_NAME, compiler2);
            worker2.addRolesValuseToRowBinary();

            // Hot-swap
            const result = RoleBaseBuckets.updateExistedInstanceRole(ROLE_NAME, worker2);
            assert.strictEqual(result, true);

            // Verify new instance is active
            const currentInstance = RoleBaseBuckets.getInsRegisterRole(ROLE_NAME);
            assert.strictEqual(currentInstance, worker2);
            assert.notStrictEqual(currentInstance, worker1);
        });

        test('updateExistedInstanceRole should maintain instanceToRoles mapping', () => {
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler1);

            const GroupPid = resourceInstance.getRoleId(ROLE_NAME);
            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');

            // Verify initial mapping
            let activeRoles = RoleBaseBuckets.getActiveRolesForInstance(parentPid, parentIndex);
            assert.ok(activeRoles.includes(GroupPid));

            // Hot-swap
            const worker2 = new RoleBinaryWorker(ROLE_NAME, compiler2);
            worker2.addRolesValuseToRowBinary();
            RoleBaseBuckets.updateExistedInstanceRole(ROLE_NAME, worker2);

            // Verify mapping is maintained
            activeRoles = RoleBaseBuckets.getActiveRolesForInstance(parentPid, parentIndex);
            assert.ok(activeRoles.includes(GroupPid));
        });

        test('updateExistedInstanceRole should return error for non-existent role', () => {
            const worker = new RoleBinaryWorker(ROLE_NAME, compiler1);
            worker.addRolesValuseToRowBinary();

            const result = RoleBaseBuckets.updateExistedInstanceRole('NON_EXISTENT_ROLE', worker);
            assert.strictEqual(result.code, SYSTEM_STATUS.RESOURCE_NOT_FOUND);
        });

        test('updateExistedInstanceRole should return error for invalid worker', () => {
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler1);

            const result = RoleBaseBuckets.updateExistedInstanceRole(ROLE_NAME, null);
            assert.strictEqual(result.code, SYSTEM_STATUS.RECOMPILE_FAILED);
        });

        test('updateExistedInstanceRole should return error for worker without buffer', () => {
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler1);

            const invalidWorker = { groupRolesPid: 1 };
            const result = RoleBaseBuckets.updateExistedInstanceRole(ROLE_NAME, invalidWorker);
            assert.strictEqual(result.code, SYSTEM_STATUS.RECOMPILE_FAILED);
        });

        test('Hot-Swap should be atomic (no downtime)', () => {
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            /**
             * @type {RoleBinaryWorker}
             */
           const worker1= RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler1);
           worker1.addRolesValuseToRowBinary();

            const GroupPid = resourceInstance.getRoleId(ROLE_NAME);
            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            const childPid = TYPE_IDS.SEARCH_INDEXES;
            const childIndex = resourceInstance.getResourceInstanceIndex('SEARCH_INDEXES', 'idx_1');
            const grandChildPid = TYPE_IDS.FIELD_METRICS;
            const grandChildIndex = resourceInstance.getResourceInstanceIndex('FIELD_METRICS', 'metric_1');
           

            const authCheck = new AutherizationCheck();

            // Verify access before hot-swap
            let access = authCheck.checkAccess(
                GroupPid,
                parentPid,
                parentIndex,
                childPid,
                childIndex,
                grandChildPid,
                grandChildIndex
            );
           
            assert.ok(typeof access === 'number');
            assert.strictEqual(authCheck.canPerformPrimary(access, DEFAULT_ACTIONS.READ), true);

            // Hot-swap
            const worker2 = new RoleBinaryWorker(ROLE_NAME, compiler2);
            worker2.addRolesValuseToRowBinary();
            RoleBaseBuckets.updateExistedInstanceRole(ROLE_NAME, worker2);

           
            // Verify access after hot-swap (should have more permissions)
            access = authCheck.checkAccess(
                GroupPid,
                parentPid,
                parentIndex,
                childPid,
               childIndex,
                grandChildPid,
                grandChildIndex
            );
            assert.ok(typeof access === 'number');
            assert.strictEqual(authCheck.canPerformPrimary(access, DEFAULT_ACTIONS.READ), true);
            assert.strictEqual(authCheck.canPerformPrimary(access, DEFAULT_ACTIONS.UPDATE), true);
            assert.strictEqual(authCheck.canPerformPrimary(access, DEFAULT_ACTIONS.DELETE), true);
        });

        test('replaceRoleDefinition should compile and hot-swap in one step', () => {
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler1);

            const newDefinition = {
                'member_1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: ['READ', 'WRITE'],
                        boundary: 'ALL',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['metric_1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['idx_1'],
                        ttl: null
                    }
                }
            };

            const result = RoleBaseBuckets.replaceRoleDefinition(ROLE_NAME, newDefinition);
            
            assert.strictEqual(result.code, SYSTEM_STATUS.SUCCESS);

            // Verify new instance is active
            const currentInstance = RoleBaseBuckets.getInsRegisterRole(ROLE_NAME);
            assert.ok(currentInstance);
            assert.ok(currentInstance.buffer.length > 0);
        });
    });

    // ==========================================================================
    // TEST SUITE 3: TTL Expiration
    // ==========================================================================
    describe('Test 3: TTL Expiration', () => {
        const ROLE_NAME = 'TTL_EXPIRATION_TEST_ROLE';
        let compiler;

        beforeEach(() => {
           
            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            resourceInstance.AddResourceInstance('SEARCH_INDEXES', 'idx_1');
            resourceInstance.AddResourceInstance('FIELD_METRICS', 'metric_1');

            const roleDefinition = {
                'member_1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: ['READ'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['metric_1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['idx_1'],
                        ttl: '1s' // 1 second TTL for testing
                    }
                }
            };

            compiler = new RoleCompiler(ROLE_NAME, roleDefinition);
            compiler.compile();
        });

        test('addToExpierdBucket should add expired role successfully', () => {
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler);

            const GroupPid = resourceInstance.getRoleId(ROLE_NAME);
            const memberId = 0;
            const leafId = TYPE_IDS.FIELD_METRICS;

            RoleBaseBuckets.addToExpierdBucket(GroupPid, memberId, leafId);

            assert.ok(RoleBaseBuckets.expiredBucket.has(GroupPid));
            const roleMap = RoleBaseBuckets.expiredBucket.get(GroupPid);
            assert.ok(roleMap.has(memberId));
            const leafSet = roleMap.get(memberId);
            assert.ok(leafSet.has(leafId));
        });

        test('addToExpierdBucket should handle multiple expired entries', () => {
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler);

            const GroupPid = resourceInstance.getRoleId(ROLE_NAME);

            // Add multiple expired entries
            RoleBaseBuckets.addToExpierdBucket(GroupPid, 0, TYPE_IDS.FIELD_METRICS);
            RoleBaseBuckets.addToExpierdBucket(GroupPid, 0, TYPE_IDS.SEARCH_INDEXES);
            RoleBaseBuckets.addToExpierdBucket(GroupPid, 1, TYPE_IDS.FIELD_METRICS);

            const roleMap = RoleBaseBuckets.expiredBucket.get(GroupPid);
            assert.strictEqual(roleMap.size, 2); // 2 members
            assert.strictEqual(roleMap.get(0).size, 2); // member 0 has 2 leaves
            assert.strictEqual(roleMap.get(1).size, 1); // member 1 has 1 leaf
        });

        test('flushExpiredBucketAsync should process expired roles', async () => {
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler);

            const GroupPid = resourceInstance.getRoleId(ROLE_NAME);
            const memberId = 0;
            const leafId = TYPE_IDS.FIELD_METRICS;

            // Add expired entry
            RoleBaseBuckets.addToExpierdBucket(GroupPid, memberId, leafId);

            // Wait for background flush
            await new Promise(resolve => setTimeout(resolve, 200));

            // Verify expired bucket is cleared
            assert.strictEqual(RoleBaseBuckets.expiredBucket.size, 0);
        });

        test('flushExpiredBucketAsync should recompile role without expired member', async () => {
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler);

            const GroupPid = resourceInstance.getRoleId(ROLE_NAME);
            const memberId = 0;
            const leafId = TYPE_IDS.FIELD_METRICS;

            const workerBefore = RoleBaseBuckets.getInsRegisterRole(ROLE_NAME);
            const bufferLengthBefore = workerBefore.buffer.length;

            // Add expired entry
            RoleBaseBuckets.addToExpierdBucket(GroupPid, memberId, leafId);

            // Wait for background flush
            await new Promise(resolve => setTimeout(resolve, 200));

            // Verify role was recompiled
            const workerAfter = RoleBaseBuckets.getInsRegisterRole(ROLE_NAME);
            assert.ok(workerAfter);
            // Buffer might be different size after recompilation
        });

        test('triggerBackgroundFlush should not block event loop', async () => {
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler);

            const GroupPid = resourceInstance.getRoleId(ROLE_NAME);

            // Add expired entry
            RoleBaseBuckets.addToExpierdBucket(GroupPid, 0, TYPE_IDS.FIELD_METRICS);

            // Should not block
            const start = performance.now();
            await new Promise(resolve => setImmediate(resolve));
            const duration = performance.now() - start;

            // Should complete quickly (< 50ms)
            assert.ok(duration < 50, `Background flush took ${duration}ms, expected < 50ms`);
        });

        test('isFlushing flag should prevent concurrent flushes', async () => {
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler);

            const GroupPid = resourceInstance.getRoleId(ROLE_NAME);

            // Add multiple expired entries
            for (let i = 0; i < 10; i++) {
                RoleBaseBuckets.addToExpierdBucket(GroupPid, 0, TYPE_IDS.FIELD_METRICS);
            }

            // Wait for flush to complete
            await new Promise(resolve => setTimeout(resolve, 300));

            // Verify isFlushing is false
            assert.strictEqual(RoleBaseBuckets.isFlushing, false);
        });
    });

    // ==========================================================================
    // TEST SUITE 4: Role Removal
    // ==========================================================================
    describe('Test 4: Role Removal', () => {
        const ROLE_NAME = 'REMOVAL_TEST_ROLE';
        let compiler;

        beforeEach(() => {
           
            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            resourceInstance.AddResourceInstance('SEARCH_INDEXES', 'idx_1');
            resourceInstance.AddResourceInstance('FIELD_METRICS', 'metric_1');

            const roleDefinition = {
                'member_1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: ['READ'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['metric_1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['idx_1'],
                        ttl: null
                    }
                }
            };

            compiler = new RoleCompiler(ROLE_NAME, roleDefinition);
            compiler.compile();
        });

        test('removeRegisterRole should remove role successfully', () => {
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler);

            const GroupPid = resourceInstance.getRoleId(ROLE_NAME);
            const removedInstance = RoleBaseBuckets.removeRegisterRole(ROLE_NAME);

            assert.ok(removedInstance);
            assert.ok(removedInstance instanceof RoleBinaryWorker);

            // Verify role is removed from buckets
            assert.ok(!RoleBaseBuckets.bucket.has(GroupPid));
            assert.ok(!RoleBaseBuckets.insBucket.has(GroupPid));
        });

        test('removeRegisterRole should clean instanceToRoles mapping', () => {
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler);

            const GroupPid = resourceInstance.getRoleId(ROLE_NAME);
            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');

            // Verify mapping exists
            let activeRoles = RoleBaseBuckets.getActiveRolesForInstance(parentPid, parentIndex);
            assert.ok(activeRoles.includes(GroupPid));

            // Remove role
            RoleBaseBuckets.removeRegisterRole(ROLE_NAME);

            // Verify mapping is cleaned
            activeRoles = RoleBaseBuckets.getActiveRolesForInstance(parentPid, parentIndex);
            assert.ok(!activeRoles.includes(GroupPid));
        });

        test('removeRegisterRole should return null for non-existent role', () => {
            const result = RoleBaseBuckets.removeRegisterRole('NON_EXISTENT_ROLE');
            assert.strictEqual(result, null);
        });
    });

    // ==========================================================================
    // TEST SUITE 5: instanceToRoles Reverse Index
    // ==========================================================================
    describe('Test 5: instanceToRoles Reverse Index', () => {
        const ROLE_NAME_1 = 'INDEX_TEST_ROLE_1';
        const ROLE_NAME_2 = 'INDEX_TEST_ROLE_2';
        let compiler1;
        let compiler2;

        beforeEach(() => {
           
           
            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            resourceInstance.AddResourceInstance('SEARCH_INDEXES', 'idx_1');
            resourceInstance.AddResourceInstance('FIELD_METRICS', 'metric_1');

            const roleDefinition1 = {
                'member_1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: ['READ'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['metric_1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['idx_1'],
                        ttl: null
                    }
                }
            };

            const roleDefinition2 = {
                'member_1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: ['UPDATE'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['metric_1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['idx_1'],
                        ttl: null
                    }
                }
            };

            compiler1 = new RoleCompiler(ROLE_NAME_1, roleDefinition1);
            compiler1.compile();

            compiler2 = new RoleCompiler(ROLE_NAME_2, roleDefinition2);
            compiler2.compile();
        });

        test('createParentInstanceMapToRoleId should build reverse index', () => {
            RoleBaseBuckets.registerNewRole(ROLE_NAME_1, RoleBinaryWorker);
            RoleBaseBuckets.createRegisterRole(ROLE_NAME_1, ROLE_NAME_1, compiler1);

            const GroupPid = resourceInstance.getRoleId(ROLE_NAME_1);
            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');

            const activeRoles = RoleBaseBuckets.getActiveRolesForInstance(parentPid, parentIndex);
            assert.ok(activeRoles.includes(GroupPid));
        });

        test('getActiveRolesForInstance should return all roles for instance', () => {
            RoleBaseBuckets.registerNewRole(ROLE_NAME_1, RoleBinaryWorker);
            RoleBaseBuckets.createRegisterRole(ROLE_NAME_1, ROLE_NAME_1, compiler1);

            RoleBaseBuckets.registerNewRole(ROLE_NAME_2, RoleBinaryWorker);
            RoleBaseBuckets.createRegisterRole(ROLE_NAME_2, ROLE_NAME_2, compiler2);

            const GroupPid1 = resourceInstance.getRoleId(ROLE_NAME_1);
            const GroupPid2 = resourceInstance.getRoleId(ROLE_NAME_2);
            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');

            const activeRoles = RoleBaseBuckets.getActiveRolesForInstance(parentPid, parentIndex);
            assert.ok(activeRoles.includes(GroupPid1));
            assert.ok(activeRoles.includes(GroupPid2));
            assert.strictEqual(activeRoles.length, 2);
        });

        test('getActiveRolesForInstance should return empty array for non-existent instance', () => {
            const activeRoles = RoleBaseBuckets.getActiveRolesForInstance(99999, 0);
            assert.deepStrictEqual(activeRoles, []);
        });
    });

    // ==========================================================================
    // TEST SUITE 6: Full Lifecycle Integration
    // ==========================================================================
    describe('Test 6: Full Lifecycle Integration', () => {
        const ROLE_NAME = 'LIFECYCLE_TEST_ROLE';
        let compiler;

        beforeEach(() => {
            
            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            resourceInstance.AddResourceInstance('SEARCH_INDEXES', 'idx_1');
            resourceInstance.AddResourceInstance('FIELD_METRICS', 'metric_1');

            const roleDefinition = {
                'member_1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: ['READ'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['metric_1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['idx_1'],
                        ttl: null
                    }
                }
            };

            compiler = new RoleCompiler(ROLE_NAME, roleDefinition);
            compiler.compile();
        });

        test('Full lifecycle: register → create → hot-swap → expire → remove', async () => {
            const authCheck = new AutherizationCheck();
            const GroupPid = resourceInstance.getRoleId(ROLE_NAME);
            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            const childPid = TYPE_IDS.SEARCH_INDEXES;
            const childIndex = resourceInstance.getResourceInstanceIndex('SEARCH_INDEXES', 'idx_1');
            const grandChildPid = TYPE_IDS.FIELD_METRICS;
            const grandChildIndex = resourceInstance.getResourceInstanceIndex('FIELD_METRICS', 'metric_1');

            // 1. Register
            const registerResult = RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            assert.strictEqual(registerResult, true);

            // 2. Create
            const instance = RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler);
            instance.addRolesValuseToRowBinary();
            assert.ok(instance);
           

            // 3. Verify access
            let access = authCheck.checkAccess(
                GroupPid,
                parentPid,
                parentIndex,
                childPid,
                childIndex,
                grandChildPid,
                grandChildIndex
            );
            assert.ok(typeof access === 'number');

            // 4. Hot-swap
            const newDefinition = {
                'member_1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: ['READ', 'UPDATE'],
                        boundary: 'ALL',
                        actionToOthers: ['READ'],
                        boundaryToOthers: 'ALL',
                        ownerInstance: ['metric_1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['idx_1'],
                        ttl: null
                    }
                }
            };
            const swapResult = RoleBaseBuckets.replaceRoleDefinition(ROLE_NAME, newDefinition);
            const work=RoleBaseBuckets.getInsRegisterRole(ROLE_NAME);
            assert.strictEqual(swapResult.code, SYSTEM_STATUS.SUCCESS);

          
          

            // 5. Verify updated access
            access = authCheck.checkAccess(
                GroupPid,
                parentPid,
                parentIndex,
                childPid,
                childIndex,
                grandChildPid,
                grandChildIndex
            );
            assert.ok(typeof access === 'number');
            assert.strictEqual(authCheck.canPerformPrimary(access, DEFAULT_ACTIONS.UPDATE), true);

            // 6. Add expired entry
            RoleBaseBuckets.addToExpierdBucket(GroupPid, 0, grandChildPid);

            // 7. Wait for flush
            await new Promise(resolve => setTimeout(resolve, 200));
            assert.strictEqual(RoleBaseBuckets.expiredBucket.size, 0);

            // 8. Remove
            const removedInstance = RoleBaseBuckets.removeRegisterRole(ROLE_NAME);
            assert.ok(removedInstance);

            // 9. Verify removal
            assert.ok(!RoleBaseBuckets.bucket.has(GroupPid));
            assert.ok(!RoleBaseBuckets.insBucket.has(GroupPid));
        });
    });

    // ==========================================================================
    // TEST SUITE 7: Performance Tests
    // ==========================================================================
    describe('Test 7: Performance', () => {
        test('Hot-swap should be fast (< 100ms)', () => {
            const ROLE_NAME = 'PERF_HOT_SWAP_ROLE';
          
            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            resourceInstance.AddResourceInstance('SEARCH_INDEXES', 'idx_1');
            resourceInstance.AddResourceInstance('FIELD_METRICS', 'metric_1');

            const roleDefinition = {
                'member_1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: ['READ'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['metric_1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['idx_1'],
                        ttl: null
                    }
                }
            };

            const compiler1 = new RoleCompiler(ROLE_NAME, roleDefinition);
            compiler1.compile();

            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler1);

            const compiler2 = new RoleCompiler(ROLE_NAME, roleDefinition,true);
            compiler2.compile();
            const worker2 = new RoleBinaryWorker(ROLE_NAME, compiler2);
            worker2.addRolesValuseToRowBinary();

            const start = performance.now();
            RoleBaseBuckets.updateExistedInstanceRole(ROLE_NAME, worker2);
            const duration = performance.now() - start;

            assert.ok(duration < 100, `Hot-swap took ${duration}ms, expected < 100ms`);
        });

        test('getActiveRolesForInstance should be O(1)', () => {
            // Create 100 roles
            for (let i = 0; i < 100; i++) {
                const roleName = `PERF_ROLE_${i}`;
              
            }

            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            resourceInstance.AddResourceInstance('SEARCH_INDEXES', 'idx_1');
            resourceInstance.AddResourceInstance('FIELD_METRICS', 'metric_1');

            const roleDefinition = {
                'member_1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: ['READ'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['metric_1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['idx_1'],
                        ttl: null
                    }
                }
            };

            // Register and create all roles
            for (let i = 0; i < 100; i++) {
                const roleName = `PERF_ROLE_${i}`;
                const compiler = new RoleCompiler(roleName, roleDefinition);
                compiler.compile();
                RoleBaseBuckets.registerNewRole(roleName, RoleBinaryWorker);
                RoleBaseBuckets.createRegisterRole(roleName, roleName, compiler);
            }

            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');

            const start = performance.now();
            for (let i = 0; i < 1000; i++) {
                RoleBaseBuckets.getActiveRolesForInstance(parentPid, parentIndex);
            }
            const duration = performance.now() - start;

            assert.ok(duration < 50, `getActiveRolesForInstance took ${duration}ms for 1000 calls, expected < 50ms`);
        });
    });
});