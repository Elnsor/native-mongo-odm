import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { resourceInstance } from '../rbac/buckets/systemReourcesInstances.js';
import { RoleBaseBuckets } from '../rbac/buckets/buckets.js';
import { RoleCompiler } from '../rbac/compiler/schema-parser.js';
import { RoleBinaryWorker } from '../rbac/allocator/binary-worker.js';
import { AutherizationCheck } from '../rbac/authorized/authorization.js';
import { 
    TYPE_IDS, 
    TYPE_IDS_NAME,
    STRIDER_SIZES, 
    SYSTEM_STATUS,
    SIZE_POWER,
    DEFAULT_ACTIONS
} from '../rbac/constant/resourceType.js';

describe('RoleBaseBuckets - Comprehensive Native Tests', () => {
    
    // Helper to create a valid modern role definition
    const createRoleDef = (roleName, ttl = null) => ({
        'member_1': {
            'FIELD_METRICS': {
                parentResource: 'COLLECTIONS',
                parentInstance: ['users_collection'],
                action: 'RWO',          // Unified notation
                actionToOthers: 'RO',
                ownerInstance: [{ name: 'metric_1', ttl: ttl }],
                nested: 'SEARCH_INDEXES',
                nestedInstance: ['idx_1']
            }
        }
    });

    beforeEach(() => {
        // Reset singleton state
        resourceInstance.reset();
        SIZE_POWER.WILDCARD = 32;
        
        // Clear all static buckets
        RoleBaseBuckets.bucket.clear();
        RoleBaseBuckets.insBucket.clear();
        RoleBaseBuckets.expiredBucket.clear();
        RoleBaseBuckets.instanceToRoles.clear();
        RoleBaseBuckets.isFlushing = false;
        RoleBaseBuckets.cancelPendingFlush(); // Clear any lingering timers
        
        // Seed resources
        resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
        resourceInstance.AddResourceInstance('COLLECTIONS', 'products_collection');
        resourceInstance.AddResourceInstance('SEARCH_INDEXES', 'idx_1');
        resourceInstance.AddResourceInstance('FIELD_METRICS', 'metric_1');
        resourceInstance.AddResourceInstance('FIELD_METRICS', 'metric_2');
    });

    afterEach(async () => {
        // Ensure no background flushes are left hanging
        RoleBaseBuckets.cancelPendingFlush();
        if (RoleBaseBuckets.isFlushing) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    });

    // ==========================================================================
    // SUITE 1: Registration & Instantiation
    // ==========================================================================
    describe('Registration & Instantiation', () => {
        const ROLE_NAME = 'REG_TEST_ROLE';
        

        it('should register a new role class successfully', () => {
            resourceInstance.AddRole(ROLE_NAME);
            const result = RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            assert.strictEqual(result, true);
            const GroupPid = resourceInstance.getRoleId(ROLE_NAME);
            assert.ok(RoleBaseBuckets.bucket.has(GroupPid));
        });

        it('should return error for duplicate role registration', () => {
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            const result = RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            assert.strictEqual(result.code, SYSTEM_STATUS.ROLE_EXISTS);
        });

        it('should create and register an active role instance', () => {
            const compiler = new RoleCompiler(ROLE_NAME, createRoleDef(ROLE_NAME));
            compiler.compile();
            
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            const instance = RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler);
            
            assert.ok(instance instanceof RoleBinaryWorker);
            const GroupPid = resourceInstance.getRoleId(ROLE_NAME);
            assert.ok(RoleBaseBuckets.insBucket.has(GroupPid));
        });

        it('should fail to create instance if role class is not registered', () => {
            const compiler = new RoleCompiler(ROLE_NAME, createRoleDef(ROLE_NAME));
            compiler.compile();
            
            const result = RoleBaseBuckets.createRegisterRole('NON_EXISTENT', 'NON_EXISTENT', compiler);
            assert.strictEqual(result.code, SYSTEM_STATUS.RESOURCE_NOT_FOUND);
        });

        it('should fail to create instance if already exists', () => {
            const compiler = new RoleCompiler(ROLE_NAME, createRoleDef(ROLE_NAME));
            compiler.compile();
            
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler);
            
            const result = RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler);
            assert.strictEqual(result.code, SYSTEM_STATUS.RESOURCE_NOT_FOUND);
        });
    });

    // ==========================================================================
    // SUITE 2: Reverse Indexing (instanceToRoles)
    // ==========================================================================
    describe('Reverse Indexing (instanceToRoles)', () => {
        const ROLE_NAME = 'INDEX_TEST_ROLE';

        it('should build reverse index on role creation', () => {
            const compiler = new RoleCompiler(ROLE_NAME, createRoleDef(ROLE_NAME));
            compiler.compile()
            
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler);

            const GroupPid = resourceInstance.getRoleId(ROLE_NAME);
            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');

            const activeRoles = RoleBaseBuckets.getActiveRolesForInstance(parentPid, parentIndex);
            
            assert.ok(activeRoles.includes(GroupPid));
        });

        it('should return empty array for non-existent instance', () => {
            const activeRoles = RoleBaseBuckets.getActiveRolesForInstance(99999, 0);
            assert.deepStrictEqual(activeRoles, []);
        });

        it('should correctly identify if parent instance is active', () => {
            const compiler = new RoleCompiler(ROLE_NAME, createRoleDef(ROLE_NAME));
            compiler.compile();
            
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler);

            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            const wrongIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'products_collection');

            assert.strictEqual(RoleBaseBuckets.isParentReourceInstanceActive(parentPid, parentIndex), true);
            assert.strictEqual(RoleBaseBuckets.isParentReourceInstanceActive(parentPid, wrongIndex), false);
        });

        it('should clean reverse index on role removal', () => {
            const compiler = new RoleCompiler(ROLE_NAME, createRoleDef(ROLE_NAME));
            compiler.compile();
            
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler);

            RoleBaseBuckets.removeRegisterRole(ROLE_NAME);

            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            const activeRoles = RoleBaseBuckets.getActiveRolesForInstance(parentPid, parentIndex);
            
            assert.strictEqual(activeRoles.length, 0);
        });
    });

    // ==========================================================================
    // SUITE 3: Atomic Hot-Swap
    // ==========================================================================
    describe('Atomic Hot-Swap', () => {
        const ROLE_NAME = 'HOT_SWAP_ROLE';

        it('should hot-swap worker instance successfully', () => {
            const compiler1 = new RoleCompiler(ROLE_NAME, createRoleDef(ROLE_NAME));
            compiler1.compile();
            
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            const worker1 = RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler1);
            worker1.addRolesValuseToRowBinary();

            // Create updated definition
            const updatedDef = createRoleDef(ROLE_NAME);
            updatedDef['member_1']['FIELD_METRICS'].action = 'RWUDA'; // Upgrade permissions
            
            const compiler2 = new RoleCompiler(ROLE_NAME, updatedDef, true);
            compiler2.compile();
            const worker2 = new RoleBinaryWorker(ROLE_NAME, compiler2);
            worker2.addRolesValuseToRowBinary();

            const result = RoleBaseBuckets.updateExistedInstanceRole(ROLE_NAME, worker2);
            assert.strictEqual(result, true);

            const currentInstance = RoleBaseBuckets.getInsRegisterRole(ROLE_NAME);
            assert.strictEqual(currentInstance, worker2);
            assert.notStrictEqual(currentInstance, worker1);
        });

        it('should maintain reverse index integrity after hot-swap', () => {
            const compiler = new RoleCompiler(ROLE_NAME, createRoleDef(ROLE_NAME));
            compiler.compile();
            
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler);

            const GroupPid = resourceInstance.getRoleId(ROLE_NAME);
            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');

            const worker2 = new RoleBinaryWorker(ROLE_NAME, compiler);
            worker2.addRolesValuseToRowBinary();
            RoleBaseBuckets.updateExistedInstanceRole(ROLE_NAME, worker2);

            const activeRoles = RoleBaseBuckets.getActiveRolesForInstance(parentPid, parentIndex);
            assert.ok(activeRoles.includes(GroupPid));
        });

        it('should reject hot-swap for non-existent role', () => {
            const compiler = new RoleCompiler(ROLE_NAME, createRoleDef(ROLE_NAME));
            compiler.compile();
            const worker = new RoleBinaryWorker(ROLE_NAME, compiler);
            
            const result = RoleBaseBuckets.updateExistedInstanceRole('NON_EXISTENT', worker);
            assert.strictEqual(result.code, SYSTEM_STATUS.INVALID_ROLE_ID);
        });

        it('should reject hot-swap for invalid worker (no buffer)', () => {
           
            const compiler = new RoleCompiler(ROLE_NAME, createRoleDef(ROLE_NAME));
            compiler.compile();
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler);

            const invalidWorker = { groupRolesPid: 1 };
            const result = RoleBaseBuckets.updateExistedInstanceRole(ROLE_NAME, invalidWorker);
            assert.strictEqual(result.code, SYSTEM_STATUS.RECOMPILE_FAILED);
        });

        it('replaceRoleDefinition should compile and hot-swap in one step', () => {
            const compiler = new RoleCompiler(ROLE_NAME, createRoleDef(ROLE_NAME));
            compiler.compile();
            
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler);

            const newDef = createRoleDef(ROLE_NAME);
            newDef['member_1']['FIELD_METRICS'].action = 'RWUDA';

            const result = RoleBaseBuckets.replaceRoleDefinition(ROLE_NAME, newDef);
            assert.strictEqual(result.code, SYSTEM_STATUS.SUCCESS);

            const currentInstance = RoleBaseBuckets.getInsRegisterRole(ROLE_NAME);
            assert.ok(currentInstance.buffer.length > 0);
        });
    });

    // ==========================================================================
    // SUITE 4: Expiration & Background Flush (Dual-Window)
    // ==========================================================================
    describe('Expiration & Background Flush', () => {
        const ROLE_NAME = 'TTL_FLUSH_ROLE';

        it('should add expired entries to bucket correctly', () => {
            const compiler = new RoleCompiler(ROLE_NAME, createRoleDef(ROLE_NAME, '1h'));
            compiler.compile();
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler);

            const GroupPid = resourceInstance.getRoleId(ROLE_NAME);
            RoleBaseBuckets.addToExpierdBucket(GroupPid, 0, TYPE_IDS.FIELD_METRICS);

            assert.ok(RoleBaseBuckets.expiredBucket.has(GroupPid));
            const roleMap = RoleBaseBuckets.expiredBucket.get(GroupPid);
            assert.ok(roleMap.get(0).has(TYPE_IDS.FIELD_METRICS));
        });

        it('should trigger immediate flush when BATCH_THRESHOLD is reached', async () => {
            // Lower threshold for testing
            const originalThreshold = RoleBaseBuckets.BATCH_THRESHOLD;
            RoleBaseBuckets.BATCH_THRESHOLD = 1;

            const compiler = new RoleCompiler(ROLE_NAME, createRoleDef(ROLE_NAME, '1s')); // 1s TTL
            compiler.compile();
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler);

            const GroupPid = resourceInstance.getRoleId(ROLE_NAME);
            RoleBaseBuckets.addToExpierdBucket(GroupPid, 0, TYPE_IDS.FIELD_METRICS);

            // Wait for setImmediate to process
            await new Promise(resolve => setImmediate(resolve));
            await new Promise(resolve => setTimeout(resolve, 50));

            assert.strictEqual(RoleBaseBuckets.expiredBucket.size, 0);
            assert.strictEqual(RoleBaseBuckets.isFlushing, false);

            // Restore
            RoleBaseBuckets.BATCH_THRESHOLD = originalThreshold;
        });

        it('should trigger flush via TIME WINDOW', async () => {
            const originalInterval = RoleBaseBuckets.FLUSH_INTERVAL_MS;
            RoleBaseBuckets.FLUSH_INTERVAL_MS = 100; // 100ms for testing

            const compiler = new RoleCompiler(ROLE_NAME, createRoleDef(ROLE_NAME, '1s'));
            compiler.compile();
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler);

            await new Promise(resolve => setTimeout(resolve, 200));

            const GroupPid = resourceInstance.getRoleId(ROLE_NAME);
            RoleBaseBuckets.addToExpierdBucket(GroupPid, 0, TYPE_IDS.FIELD_METRICS);

            // Wait for timer to trigger
            await new Promise(resolve => setTimeout(resolve, 150));
            await new Promise(resolve => setImmediate(resolve));

            assert.strictEqual(RoleBaseBuckets.expiredBucket.size, 0);
            assert.strictEqual(RoleBaseBuckets.isFlushing, false);

            RoleBaseBuckets.FLUSH_INTERVAL_MS = originalInterval;
        });

        it('should surgically remove expired owners and hot-swap atomically', async () => {
             const originalInterval = RoleBaseBuckets.FLUSH_INTERVAL_MS;
            RoleBaseBuckets.FLUSH_INTERVAL_MS = 100; // 100ms for testing
            // Create role with 100ms TTL
            const compiler = new RoleCompiler(ROLE_NAME, createRoleDef(ROLE_NAME, 0.1)); // 0.1 seconds
            compiler.compile();
          
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            const worker = RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler);
            worker.addRolesValuseToRowBinary();
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const GroupPid = resourceInstance.getRoleId(ROLE_NAME);
            
            // Manually add to expired bucket to force flush
            RoleBaseBuckets.addToExpierdBucket(GroupPid, 0, TYPE_IDS.FIELD_METRICS);

            // Wait for flush to process and remove the expired owner
            await new Promise(resolve => setTimeout(resolve, 200));
            await new Promise(resolve => setImmediate(resolve));

            // Verify the role was recompiled and swapped
            const newWorker = RoleBaseBuckets.getInsRegisterRole(ROLE_NAME);
            assert.ok(newWorker);
            assert.notStrictEqual(newWorker, worker); // Should be a new instance
            
            // The expired owner should be gone from the new definition
           
            const newDef = Object.keys(newWorker.roles.ListOfMemberGroups['member-100-0']);
            assert.strictEqual(newDef.length, 0); // Rule is nullified when all owners expire and when its null and its only leaf then the member become empty
              RoleBaseBuckets.FLUSH_INTERVAL_MS = originalInterval;
        });

        it('should protect live worker if recompilation fails during flush', async () => {
            const compiler = new RoleCompiler(ROLE_NAME, createRoleDef(ROLE_NAME, '1s'));
            compiler.compile();
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            const originalWorker = RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler);
            originalWorker.addRolesValuseToRowBinary();

            const GroupPid = resourceInstance.getRoleId(ROLE_NAME);
            RoleBaseBuckets.addToExpierdBucket(GroupPid, 0, TYPE_IDS.FIELD_METRICS);

            // Mock compile failure by temporarily breaking the compiler
            const originalCompile = RoleCompiler.prototype.compile;
            RoleCompiler.prototype.compile = () => ({ code: -99, message: 'Mock Compile Error' });

            try {
                // Trigger flush
                RoleBaseBuckets.triggerBackgroundFlush();
                await new Promise(resolve => setTimeout(resolve, 100));
                await new Promise(resolve => setImmediate(resolve));

                // Live worker should remain untouched
                const currentWorker = RoleBaseBuckets.getInsRegisterRole(ROLE_NAME);
                assert.strictEqual(currentWorker, originalWorker);
            } finally {
                RoleCompiler.prototype.compile = originalCompile;
            }
        });

        it('should prevent concurrent flushes via isFlushing flag', async () => {
            const compiler = new RoleCompiler(ROLE_NAME, createRoleDef(ROLE_NAME, '1s'));
            compiler.compile();
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler);

            const GroupPid = resourceInstance.getRoleId(ROLE_NAME);
            
            // Add many entries
            for (let i = 0; i < 5; i++) {
                RoleBaseBuckets.addToExpierdBucket(GroupPid, 0, TYPE_IDS.FIELD_METRICS);
            }

            RoleBaseBuckets.triggerBackgroundFlush();
            assert.strictEqual(RoleBaseBuckets.isFlushing, true);

            // Second trigger should be ignored
            RoleBaseBuckets.triggerBackgroundFlush();
            
            await new Promise(resolve => setTimeout(resolve, 100));
            assert.strictEqual(RoleBaseBuckets.isFlushing, false);
        });
    });

    // ==========================================================================
    // SUITE 5: Role Removal & Cleanup
    // ==========================================================================
    describe('Role Removal & Cleanup', () => {
        const ROLE_NAME = 'REMOVAL_TEST_ROLE';

        it('should remove role and clean all references successfully', () => {
            const compiler = new RoleCompiler(ROLE_NAME, createRoleDef(ROLE_NAME));
            compiler.compile();
            
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler);

            const GroupPid = resourceInstance.getRoleId(ROLE_NAME);
            const removedInstance = RoleBaseBuckets.removeRegisterRole(ROLE_NAME);

            assert.ok(removedInstance instanceof RoleBinaryWorker);
            assert.ok(!RoleBaseBuckets.bucket.has(GroupPid));
            assert.ok(!RoleBaseBuckets.insBucket.has(GroupPid));
        });

        it('should return null when removing non-existent role', () => {
            const result = RoleBaseBuckets.removeRegisterRole('NON_EXISTENT_ROLE');
            assert.strictEqual(result, null);
        });
    });

    // ==========================================================================
    // SUITE 6: Full Lifecycle Integration
    // ==========================================================================
    describe('Full Lifecycle Integration', () => {
        const ROLE_NAME = 'LIFECYCLE_ROLE';

        it('should complete full lifecycle: register → create → hot-swap → expire → remove', async () => {
            const originalInterval=RoleBaseBuckets.FLUSH_INTERVAL_MS;
            RoleBaseBuckets.FLUSH_INTERVAL_MS=100;
            const authCheck = new AutherizationCheck();
            
            // 1. Register & Create
            const compiler = new RoleCompiler(ROLE_NAME, createRoleDef(ROLE_NAME, '1s'));
            compiler.compile();
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            const instance = RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler);
            instance.addRolesValuseToRowBinary();
            assert.ok(instance);

            const GroupPid = resourceInstance.getRoleId(ROLE_NAME);
            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            const childPid = TYPE_IDS.SEARCH_INDEXES;
            const childIndex = resourceInstance.getResourceInstanceIndex('SEARCH_INDEXES', 'idx_1');
            const grandChildPid = TYPE_IDS.FIELD_METRICS;
            const grandChildIndex = resourceInstance.getResourceInstanceIndex('FIELD_METRICS', 'metric_1');

            // 2. Verify initial access
            let access = authCheck.checkAccess(GroupPid, parentPid, parentIndex, childPid, childIndex, grandChildPid, grandChildIndex);
            assert.ok(typeof access === 'number');

            // 3. Hot-swap
            const newDef = createRoleDef(ROLE_NAME, '1s');
            newDef['member_1']['FIELD_METRICS'].action = 'RWUDA';
            const swapResult = RoleBaseBuckets.replaceRoleDefinition(ROLE_NAME, newDef);
            assert.strictEqual(swapResult.code, SYSTEM_STATUS.SUCCESS);

            // 4. Verify updated access
            access = authCheck.checkAccess(GroupPid, parentPid, parentIndex, childPid, childIndex, grandChildPid, grandChildIndex);
            assert.ok(typeof access === 'number');
            assert.strictEqual(authCheck.canPerformPrimary(access, DEFAULT_ACTIONS.UPDATE), true);

            // 5. Expire
            RoleBaseBuckets.addToExpierdBucket(GroupPid, 0, grandChildPid);
            await new Promise(resolve => setTimeout(resolve, 150)); // Wait for flush
            await new Promise(resolve => setImmediate(resolve));
            assert.strictEqual(RoleBaseBuckets.expiredBucket.size, 0);

            // 6. Remove
            const removedInstance = RoleBaseBuckets.removeRegisterRole(ROLE_NAME);
            assert.ok(removedInstance);
            assert.ok(!RoleBaseBuckets.insBucket.has(GroupPid));
            RoleBaseBuckets.FLUSH_INTERVAL_MS = originalInterval;
        });
    });

    // ==========================================================================
    // SUITE 7: Performance Benchmarks
    // ==========================================================================
    describe('Performance Benchmarks', () => {
        it('getActiveRolesForInstance should be O(1) and extremely fast', () => {
            const ROLE_NAME_BASE = 'PERF_ROLE';
            
            // Register 100 roles
            for (let i = 0; i < 100; i++) {
                const roleName = `${ROLE_NAME_BASE}_${i}`;
                const compiler = new RoleCompiler(roleName, createRoleDef(roleName));
                compiler.compile();
                RoleBaseBuckets.registerNewRole(roleName, RoleBinaryWorker);
                RoleBaseBuckets.createRegisterRole(roleName, roleName, compiler);
            }

            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');

            const start = performance.now();
            for (let i = 0; i < 10000; i++) {
                RoleBaseBuckets.getActiveRolesForInstance(parentPid, parentIndex);
            }
            const duration = performance.now() - start;

            // 10,000 O(1) lookups should take < 10ms
            assert.ok(duration < 10, `getActiveRolesForInstance took ${duration}ms for 10000 calls, expected < 10ms`);
        });

        it('Hot-swap should complete in < 50ms', () => {
            const ROLE_NAME = 'PERF_HOT_SWAP';
            const compiler = new RoleCompiler(ROLE_NAME, createRoleDef(ROLE_NAME));
            compiler.compile();
            
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler);

            const compiler2 = new RoleCompiler(ROLE_NAME, createRoleDef(ROLE_NAME), true);
            compiler2.compile();
            const worker2 = new RoleBinaryWorker(ROLE_NAME, compiler2);
            worker2.addRolesValuseToRowBinary();

            const start = performance.now();
            RoleBaseBuckets.updateExistedInstanceRole(ROLE_NAME, worker2);
            const duration = performance.now() - start;

            assert.ok(duration < 50, `Hot-swap took ${duration}ms, expected < 50ms`);
        });
    });
});

console.log('✅ RoleBaseBuckets native test suite loaded. Run with: node --test RoleBaseBuckets.native.test.js');