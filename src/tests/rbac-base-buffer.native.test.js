import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { resourceInstance } from './../rbac/buckets/systemReourcesInstances.js';
import { RoleCompiler } from './../rbac/compiler/schema-parser.js';
import { RowBinaryAllocator } from './../rbac/allocator/base-buffers.js';
import {
    TYPE_IDS,
    STRIDER_SIZES,
    SYSTEM_STATUS,
    SIZE_POWER
} from './../rbac/constant/resourceType.js';
import { RoleBinaryWorker } from '../rbac/allocator/binary-worker.js';

describe('RowBinaryAllocator - Comprehensive Native Tests', () => {
    beforeEach(() => {
        resourceInstance.reset();
        SIZE_POWER.WILDCARD = 32;
    });

    // Helper to create a valid modern role definition using EffectedActionNotation
    const createRoleDef = (roleName, options = {}) => {
        const {
            parentInstance = ['users'],
            action = 'RWO',
            actionToOthers = 'RO',
            ownerInstance = ['mat1', 'mat2'],
            nested = 'SEARCH_INDEXES',
            nestedInstance = ['sear1']
        } = options;

        return {
            'member_1': {
                'FIELD_METRICS': {
                    parentResource: 'COLLECTIONS',
                    parentInstance,
                    action,
                    actionToOthers,
                    ownerInstance,
                    nested,
                    nestedInstance,
                    ttl: null
                }
            }
        };
    };

    // ==========================================================================
    // SUITE 1: Constructor & Initialization
    // ==========================================================================
    describe('Constructor & Initialization', () => {
        const ROLE_NAME = 'INIT_TEST_ROLE';
        let compiler;

        beforeEach(() => {
            resourceInstance.AddResourceInstance('COLLECTIONS', 'users');
            resourceInstance.AddResourceInstance('SEARCH_INDEXES', 'sear1');
            resourceInstance.AddResourceInstance('FIELD_METRICS', 'mat1');
            resourceInstance.AddResourceInstance('FIELD_METRICS', 'mat2');

            compiler = new RoleCompiler(ROLE_NAME, createRoleDef(ROLE_NAME));
           // console.log(createRoleDef(ROLE_NAME));
            compiler.compile();
        });

        it('should initialize with correct groupRolesPid', () => {
            const allocator = new RowBinaryAllocator(ROLE_NAME, compiler);
            const expectedPid = resourceInstance.getRoleId(ROLE_NAME);
            assert.strictEqual(allocator.groupRolesPid, expectedPid);
        });

        it('should throw error if role is not found', () => {
            assert.throws(() => {
                new RowBinaryAllocator('NONEXISTENT_ROLE', compiler);
            }, /Roles Errors/);
        });

        it('should copy striders and totalSize from compiler', () => {
            const allocator = new RowBinaryAllocator(ROLE_NAME, compiler);
            assert.deepStrictEqual(allocator.striders, compiler.striders);
            assert.strictEqual(allocator.totalSize, compiler.striders.totalBytesSize);
            assert.ok(allocator.totalSize > 0);
        });

        it('should copy pTi, globalStriders, and compact trees from compiler', () => {
            const allocator = new RowBinaryAllocator(ROLE_NAME, compiler);
            assert.ok(allocator.pTi instanceof Map);
            assert.ok(allocator.pTi.size > 0);
            assert.deepStrictEqual(allocator.globalStriders, compiler.globalstriders);
            assert.ok(allocator.childCompactTree instanceof Map);
            assert.ok(allocator.wildCardCompactTree instanceof Map);
        });

        it('should copy pathsBuffer properties from compiler', () => {
            const allocator = new RowBinaryAllocator(ROLE_NAME, compiler);
            assert.strictEqual(allocator._pathsBuffer, compiler._pathsBuffer);
            assert.strictEqual(allocator._pathsBufferInstanceSize, compiler._pathsBufferInstanceSize);
            assert.strictEqual(allocator._pathsBufferSize, compiler._pathsBufferSize);
            assert.strictEqual(allocator._pathsBufferInstanceCounts, compiler._pathsBufferInstanceCounts);
        });

        it('should set wildcard index correctly', () => {
            const allocator = new RowBinaryAllocator(ROLE_NAME, compiler);
            assert.strictEqual(allocator.wildcard, STRIDER_SIZES.WILDCARD_INDEX);
        });
    });

    // ==========================================================================
    // SUITE 2: translateChildGlobalToCompact
    // ==========================================================================
    describe('translateChildGlobalToCompact', () => {
        const ROLE_NAME = 'COMPACT_TEST_ROLE';
        /**
         * @type {RoleBinaryWorker}
         */
        let allocator;

        beforeEach(() => {
            resourceInstance.AddResourceInstance('COLLECTIONS', 'users');
            resourceInstance.AddResourceInstance('FIELD_METRICS', 'mat1');
            resourceInstance.AddResourceInstance('FIELD_METRICS', 'mat2');
            resourceInstance.AddResourceInstance('SEARCH_INDEXES', 'sear1');

            const roleDef = createRoleDef(ROLE_NAME);
            const compiler = new RoleCompiler(ROLE_NAME, roleDef);
            console.log("++++",compiler.compile());
            allocator = new RowBinaryAllocator(ROLE_NAME, compiler);
        });

        it('should return compact index for existing parent-child pair', () => {
            const parentGlobal = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users');
            const gchildType = TYPE_IDS.FIELD_METRICS;
            const gchildGlobal = resourceInstance.getResourceInstanceIndex('FIELD_METRICS', 'mat1');
            const childGlobal=resourceInstance.getResourceInstanceIndex('SEARCH_INDEXES', 'sear1')
            
            const compact = allocator.getNested2keyGrandChildCompact(parentGlobal, gchildType, childGlobal,gchildGlobal);
            
            assert.ok(typeof compact === 'number');
            assert.ok(compact >= 0, `Compact index should be >= 0, got ${compact}`);
        });

        it('should return different compact indices for different children', () => {
             const parentGlobal = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users');
            const gchildType = TYPE_IDS.FIELD_METRICS;
            const gchildGlobal = resourceInstance.getResourceInstanceIndex('FIELD_METRICS', 'mat1');
            const gchildGlobal2 = resourceInstance.getResourceInstanceIndex('FIELD_METRICS', 'mat2');
            const childGlobal=resourceInstance.getResourceInstanceIndex('SEARCH_INDEXES', 'sear1')
            
            const compact1 = allocator.getNested2keyGrandChildCompact(parentGlobal, gchildType, childGlobal,gchildGlobal);
            const compact2 = allocator.getNested2keyGrandChildCompact(parentGlobal, gchildType, childGlobal,gchildGlobal2);
            
            assert.notStrictEqual(compact1, compact2, 'Different children should have different compact indices');
        });

        it('should return -1 for non-existent parent', () => {
            const compact = allocator.translateChildGlobalToCompact(99999, TYPE_IDS.FIELD_METRICS, 0);
            assert.strictEqual(compact, -1);
        });

        it('should return -1 for non-existent child type', () => {
            const parentGlobal = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users');
            const compact = allocator.translateChildGlobalToCompact(parentGlobal, 99999, 0);
            assert.strictEqual(compact, -1);
        });

        it('should return -1 for non-existent child global', () => {
            const parentGlobal = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users');
            const compact = allocator.translateChildGlobalToCompact(parentGlobal, TYPE_IDS.FIELD_METRICS, 99999);
            assert.strictEqual(compact, -1);
        });
    });

    // ==========================================================================
    // SUITE 3: translateWildCardGlobalToCompact
    // ==========================================================================
    describe('translateWildCardGlobalToCompact', () => {
        const ROLE_NAME = 'WILDCARD_COMPACT_ROLE';
        let allocator;

        beforeEach(() => {
            resourceInstance.AddResourceInstance('COLLECTIONS', 'users');
            resourceInstance.AddResourceInstance('FIELD_METRICS', 'mat1');
            resourceInstance.AddResourceInstance('SEARCH_INDEXES', 'sear1');


            const roleDef = createRoleDef(ROLE_NAME, {
                parentInstance: ['*'], // Wildcard parent
                ownerInstance: ['*']   // Wildcard owner
            });

            const compiler = new RoleCompiler(ROLE_NAME, roleDef);
            compiler.compile();
            allocator = new RowBinaryAllocator(ROLE_NAME, compiler);
        });

        it('should return compact index for wildcard parent', () => {
            const parentId = TYPE_IDS.COLLECTIONS;
            const gchildType = TYPE_IDS.FIELD_METRICS;
            const gchildGlobal = resourceInstance.getResourceInstanceIndex('FIELD_METRICS', 'mat1');
             const childGlobal = resourceInstance.getResourceInstanceIndex('SEARCH_INDEXES', 'sear1');
            
            const compact = allocator.getNested2keyGrandChildCompact(allocator.wildcard, gchildType, childGlobal,gchildGlobal);
            assert.ok(typeof compact === 'number');
            assert.ok(compact >= 0);
        });

        it('should fallback to wildcard index if specific global not found', () => {
            const parentId = TYPE_IDS.COLLECTIONS;
            const gchildType = TYPE_IDS.FIELD_METRICS;
            const childGlobal = resourceInstance.getResourceInstanceIndex('SEARCH_INDEXES', 'sear1');
            const gchildGlobal = 99999; // Non-existent
            
            const compact = allocator.getNested2keyGrandChildCompact(allocator.wildcard, gchildType, childGlobal,gchildGlobal);
            // Should fallback to wildcard compact index
            assert.ok(typeof compact === 'number');
            assert.ok(compact >= 0); 
        });

        it('should return -1 for non-existent parent in wildcard tree', () => {
            const compact = allocator.translateWildCardGlobalToCompact(99999, TYPE_IDS.FIELD_METRICS, 0);
            assert.strictEqual(compact, -1);
        });

        it('should return -1 for non-existent child type in wildcard tree', () => {
            const parentId = TYPE_IDS.COLLECTIONS;
            const compact = allocator.translateWildCardGlobalToCompact(parentId, 99999, 0);
            assert.strictEqual(compact, -1);
        });
    });

    // ==========================================================================
    // SUITE 4: Strider Getters
    // ==========================================================================
    describe('Strider Getters', () => {
        const ROLE_NAME = 'STRIDER_TEST_ROLE';
        let allocator;

        beforeEach(() => {
            resourceInstance.AddResourceInstance('COLLECTIONS', 'users');
            resourceInstance.AddResourceInstance('COLLECTIONS', 'products');
            resourceInstance.AddResourceInstance('SEARCH_INDEXES', 'sear1');
            resourceInstance.AddResourceInstance('FIELD_METRICS', 'mat1');
            resourceInstance.AddResourceInstance('FIELD_METRICS', 'mat2');

            const roleDef = createRoleDef(ROLE_NAME, {
                parentInstance: ['users', 'products']
            });

            const compiler = new RoleCompiler(ROLE_NAME, roleDef);
            compiler.compile();
            allocator = new RowBinaryAllocator(ROLE_NAME, compiler);
        });

        it('getinstanceStriderSize should return size map for parent instance', () => {
            const parentId = TYPE_IDS.COLLECTIONS;
            const instanceIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users');
            
            const sizeMap = allocator.getinstanceStriderSize(parentId, instanceIndex);
            
            assert.ok(sizeMap);
            assert.ok(typeof sizeMap === 'object');
            assert.ok(TYPE_IDS.FIELD_METRICS in sizeMap);
        });

        it('getinstanceStriderOffset should return offset map', () => {
            const parentId = TYPE_IDS.COLLECTIONS;
            const instanceIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users');
            
            const offsetMap = allocator.getinstanceStriderOffset(parentId, instanceIndex);
            
            assert.ok(offsetMap);
            assert.ok(typeof offsetMap === 'object');
        });

        it('getinstanceStriderShift should return shift value', () => {
            const parentId = TYPE_IDS.COLLECTIONS;
            const usersIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users');
            const productsIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'products');
            
            const shift1 = allocator.getinstanceStriderShift(parentId, usersIndex);
            const shift2 = allocator.getinstanceStriderShift(parentId, productsIndex);
            
            assert.ok(typeof shift1 === 'number');
            assert.ok(typeof shift2 === 'number');
            assert.notStrictEqual(shift1, shift2, 'Different parent instances should have different shifts');
        });

        it('getinstanceStriderShift should return 0 for non-existent parent/instance', () => {
            const shift = allocator.getinstanceStriderShift(99999, 99999);
            assert.strictEqual(shift, 0);
        });

        it('getInstacesList should return Set of instances', () => {
            const parentId = TYPE_IDS.COLLECTIONS;
            const instances = allocator.getInstacesList(parentId);
            
            assert.ok(instances instanceof Set);
            assert.ok(instances.size > 0);
            
            const usersIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users');
            const productsIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'products');
            
            assert.ok(instances.has(usersIndex));
            assert.ok(instances.has(productsIndex));
        });

        it('getInstacesList should return undefined for non-existent parent', () => {
            const instances = allocator.getInstacesList(99999);
            assert.strictEqual(instances, undefined);
        });

        it('getGlobalStrider should return global strider for wildcard parent', () => {
            // Create a wildcard role to test global strider
            const wcRoleName = 'WC_STRIDER_ROLE';
            resourceInstance.AddResourceInstance('COLLECTIONS', 'wc_users');
            
            const wcRoleDef = createRoleDef(wcRoleName, {
                parentInstance: ['*'],
                ownerInstance: ['*']
            });
            
            const wcCompiler = new RoleCompiler(wcRoleName, wcRoleDef);
            wcCompiler.compile();
            const wcAllocator = new RowBinaryAllocator(wcRoleName, wcCompiler);
            
            const global = wcAllocator.getGlobalStrider(TYPE_IDS.COLLECTIONS);
            assert.ok(global);
            assert.ok('shift' in global);
            assert.ok('totalNodeSize' in global);
        });

        it('getGlobalStrider should return undefined for non-wildcard parent', () => {
            const global = allocator.getGlobalStrider(TYPE_IDS.COLLECTIONS);
            assert.strictEqual(global, undefined);
        });
    });

    // ==========================================================================
    // SUITE 5: Edge Cases & Performance
    // ==========================================================================
    describe('Edge Cases & Performance', () => {
        it('should handle role with single instance', () => {
            resourceInstance.AddResourceInstance('COLLECTIONS', 'single_coll');
            resourceInstance.AddResourceInstance('FIELD_METRICS', 'single_mat');
            resourceInstance.AddResourceInstance("SEARCH_INDEXES",'sear1')

            const roleDef = createRoleDef('SINGLE_ROLE', {
                parentInstance: ['single_coll'],
                ownerInstance: ['single_mat']
            });

            const compiler = new RoleCompiler('SINGLE_ROLE', roleDef);
            compiler.compile();
            const allocator = new RowBinaryAllocator('SINGLE_ROLE', compiler);

            assert.ok(allocator.totalSize > 0);
        });

        it('should handle role with multiple actions (EffectedActionNotation)', () => {
            resourceInstance.AddResourceInstance('COLLECTIONS', 'multi_coll');
            resourceInstance.AddResourceInstance('FIELD_METRICS', 'multi_mat');
             resourceInstance.AddResourceInstance('SEARCH_INDEXES', 'sear1');

            const roleDef = createRoleDef('MULTI_ACTION_ROLE', {
                parentInstance: ['multi_coll'],
                action: 'RWUDA', // All actions + ALL boundary
                actionToOthers: 'RWUDA',
                ownerInstance: ['multi_mat']
            });

            const compiler = new RoleCompiler('MULTI_ACTION_ROLE', roleDef);
            compiler.compile();
            const allocator = new RowBinaryAllocator('MULTI_ACTION_ROLE', compiler);

            assert.ok(allocator.totalSize > 0);
        });

        it('translateChildGlobalToCompact should be O(1) and fast', () => {
            resourceInstance.AddResourceInstance('COLLECTIONS', 'perf_coll');
            for (let i = 0; i < 1000; i++) {
                resourceInstance.AddResourceInstance('FIELD_METRICS', `mat_${i}`);
            }

            const ownerInstances = Array.from({ length: 1000 }, (_, i) => `mat_${i}`);
            const roleDef = createRoleDef('PERF_ROLE', {
                parentInstance: ['perf_coll'],
                ownerInstance: ownerInstances
            });

             resourceInstance.AddResourceInstance('SEARCH_INDEXES', `sear1`);

            const compiler = new RoleCompiler('PERF_ROLE', roleDef);
            compiler.compile();
            const allocator = new RowBinaryAllocator('PERF_ROLE', compiler);

            const parentGlobal = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'perf_coll');
              const childGlobal = resourceInstance.getResourceInstanceIndex('SEARCH_INDEXES', 'sear1');
            const gchildType = TYPE_IDS.FIELD_METRICS;

            const start = performance.now();
            for (let i = 0; i < 1000; i++) {
                const gchildGlobal = resourceInstance.getResourceInstanceIndex('FIELD_METRICS', `mat_${i}`);
                allocator.getNested2keyGrandChildCompact(parentGlobal, gchildType,childGlobal, gchildGlobal);
            }
            const duration = performance.now() - start;

            assert.ok(duration < 50, `translateChildGlobalToCompact should be fast, took ${duration}ms`);
        });
    });
});

console.log('✅ RowBinaryAllocator comprehensive test suite loaded. Run with: node --test base-buffers.native.test.js');