// tests/rbac/base-buffers.integration.test.js
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { resourceInstance } from '../buckets/systemReourcesInstances.js';
import { RoleCompiler } from '../compiler/schema-parser.js';
import { RowBinaryAllocator } from '../allocator/base-buffers.js';
import { 
    TYPE_IDS, 
    STRIDER_SIZES, 
    SYSTEM_STATUS,
    SIZE_POWER 
} from '../constant/resourceType.js';

describe('RowBinaryAllocator - Integration Tests with Real GroupRole', () => {
    
    beforeEach(() => {
        // Reset singleton state
        resourceInstance.reset();
        SIZE_POWER.WILDCARD = 32;
    });

    // ==========================================================================
    // TEST SUITE 1: Simple Role (Parent → Child)
    // ==========================================================================
    describe('Test 1: Simple Role (COLLECTIONS → DOCUMENTS)', () => {
        const ROLE_NAME = 'SIMPLE_ROLE';
        let compiler;
        let allocator;

        beforeEach(() => {
            // 1. Register Role

            
            // 2. Register Instances
            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            resourceInstance.AddResourceInstance("SEARCH_INDEXES", 'search1');
            resourceInstance.AddResourceInstance("FIELD_METRICS", 'mat1');
            resourceInstance.AddResourceInstance("FIELD_METRICS", 'mat2');
            resourceInstance.AddResourceInstance("FIELD_METRICS", 'mat3');
           
            
            // 3. Define Real Role
            const roleDefinition = {
                'member_1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: ['READ', 'WRITE', 'UPDATE'],
                        boundary: 'OWN',
                        actionToOthers: ['READ'],
                        boundaryToOthers: 'ALL',
                        ownerInstance: ["mat1","mat2"],
                        nested: "SEARCH_INDEXES",
                        nestedInstance: ["search1"],
                        ttl: null
                    }
                }
            };
            
            // 4. Compile Role
            compiler = new RoleCompiler(ROLE_NAME, roleDefinition);
            const compileResult = compiler.compile();
            assert.strictEqual(compileResult, true);
            
            // 5. Create Allocator (base-buffers)
            allocator = new RowBinaryAllocator(ROLE_NAME, compiler);
        });

        // ======================================================================
        // 1.1 Constructor Tests
        // ======================================================================
        test('should initialize with correct groupRolesPid', () => {
            const expectedPid = resourceInstance.getRoleId(ROLE_NAME);
            assert.strictEqual(allocator.groupRolesPid, expectedPid);
        });

        test('should create buffer with correct size', () => {
            // should be 6 
            assert.ok(allocator.buffer.length > 0);
            assert.strictEqual(allocator.buffer.length, allocator.totalSize);
            assert.strictEqual(allocator.buffer.length, 11);
        });

        test('should use correct TypedArray based on WILDCARD size', () => {
            const ExpectedType = STRIDER_SIZES.WILDCARD_ARRAY_TYPE;
            assert.ok(allocator.buffer instanceof ExpectedType);
        });

        test('should copy striders from compiler', () => {
            assert.deepStrictEqual(allocator.striders, compiler.striders);
            assert.ok(allocator.striders.totalBytesSize > 0);
        });

        test('should copy globalStriders from compiler', () => {
            assert.deepStrictEqual(allocator.globalStriders, compiler.globalstriders);
        });

        test('should copy pTi (parent to instances) from compiler', () => {
            assert.ok(allocator.pTi instanceof Map);
            assert.ok(allocator.pTi.size > 0);
        });

        test('should copy childCompactTree from compiler', () => {
            assert.ok(allocator.childCompactTree instanceof Map);
            assert.ok(allocator.childCompactTree.size > 0);
        });

        test('should have wildcard index set correctly', () => {
            assert.strictEqual(allocator.wildcard, STRIDER_SIZES.WILDCARD_INDEX);
        });

        // ======================================================================
        // 1.2 translateChildGlobalToCompact Tests
        // ======================================================================
        test('should return compact index for existing parent-child pair', () => {
            const parentGlobal = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            const childType = TYPE_IDS.FIELD_METRICS;
            const childGlobal = resourceInstance.getResourceInstanceIndex("FIELD_METRICS", 'mat1');
            
            const compact = allocator.translateChildGlobalToCompact(parentGlobal, childType, childGlobal);
            
            assert.ok(typeof compact === 'number');
            assert.ok(compact >= 0, `Compact index should be >= 0, got ${compact}`);
        });

        test('should return different compact indices for different children', () => {
            const parentGlobal = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            const childType = TYPE_IDS.FIELD_METRICS;
            
            const childGlobal1 = resourceInstance.getResourceInstanceIndex('FIELD_METRICS', 'mat1');
            const childGlobal2 = resourceInstance.getResourceInstanceIndex('FIELD_METRICS', 'mat2');
          
            
            const compact1 = allocator.translateChildGlobalToCompact(parentGlobal, childType, childGlobal1);
            const compact2 = allocator.translateChildGlobalToCompact(parentGlobal, childType, childGlobal2);
            
            assert.notStrictEqual(compact1, compact2, 'Different children should have different compact indices');
        });

        test('should return -1 for non-existent parent', () => {
            const compact = allocator.translateChildGlobalToCompact(99999, TYPE_IDS.FIELD_METRICS, 0);
            assert.strictEqual(compact, -1);
        });

        test('should return -1 for non-existent child type', () => {
            const parentGlobal = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            const compact = allocator.translateChildGlobalToCompact(parentGlobal, 99999, 0);
            assert.strictEqual(compact, -1);
        });

        test('should return -1 for non-existent child global', () => {
            const parentGlobal = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            const compact = allocator.translateChildGlobalToCompact(parentGlobal, TYPE_IDS.FIELD_METRICS, 99999);
            assert.strictEqual(compact, -1);
        });

        test('should NOT find mat3 in compact tree (not in ownerInstance)', () => {
            const parentGlobal = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            const childType = TYPE_IDS.FIELD_METRICS;
            const childGlobal = resourceInstance.getResourceInstanceIndex('FIELD_METRICS', 'mat3');
            
            const compact = allocator.translateChildGlobalToCompact(parentGlobal, childType, childGlobal);
            assert.strictEqual(compact, -1, 'mat3 should not be in compact tree (not owned)');
        });

        // ======================================================================
        // 1.3 translateWildCardGlobalToCompact Tests
        // ======================================================================
        test('should return -1 for wildcard when no wildcard is defined', () => {
            const parentId = TYPE_IDS.COLLECTIONS;
            const compact = allocator.translateWildCardGlobalToCompact(parentId, TYPE_IDS.DOCUMENTS, 0);
            assert.strictEqual(compact, -1);
        });

        // ======================================================================
        // 1.4 Strider Getters Tests
        // ======================================================================
        test('getinstanceStriderSize should return size map for parent instance', () => {
            const parentId = TYPE_IDS.COLLECTIONS;
            const instanceIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            
            const sizeMap = allocator.getinstanceStriderSize(parentId, instanceIndex);
            
            assert.ok(sizeMap);
            assert.ok(typeof sizeMap === 'object');
            // Should contain DOCUMENTS size
            assert.ok(TYPE_IDS.FIELD_METRICS in sizeMap);
        });

        test('getinstanceStriderOffset should return offset map', () => {
            const parentId = TYPE_IDS.COLLECTIONS;
            const instanceIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            
            const offsetMap = allocator.getinstanceStriderOffset(parentId, instanceIndex);
            
            assert.ok(offsetMap);
            assert.ok(typeof offsetMap === 'object');
        });

        test('getinstanceStriderShift should return shift value', () => {
            const parentId = TYPE_IDS.COLLECTIONS;
            const instanceIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            
            const shift = allocator.getinstanceStriderShift(parentId, instanceIndex);
            
            assert.ok(typeof shift === 'number');
            assert.ok(shift >= 0);
        });

        test('getinstanceStriderShift should return 0 for non-existent parent', () => {
            const shift = allocator.getinstanceStriderShift(99999, 0);
            assert.strictEqual(shift, 0);
        });

        test('getInstacesList should return Set of instances', () => {
            const parentId = TYPE_IDS.COLLECTIONS;
            const instances = allocator.getInstacesList(parentId);
            
            assert.ok(instances instanceof Set);
            assert.ok(instances.size > 0);
            
            const usersCollIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            assert.ok(instances.has(usersCollIndex));
        });

        test('getInstacesList should return undefined for non-existent parent', () => {
            const instances = allocator.getInstacesList(99999);
            assert.strictEqual(instances, undefined);
        });

        test('getGlobalStrider should return undefined when no wildcard', () => {
            const global = allocator.getGlobalStrider(TYPE_IDS.COLLECTIONS);
            assert.strictEqual(global, undefined);
        });

        // ======================================================================
        // 1.5 Buffer Integrity Tests
        // ======================================================================
        test('buffer should be initialized with zeros', () => {
            for (let i = 0; i < allocator.buffer.length; i++) {
                assert.strictEqual(allocator.buffer[i], 0, `Buffer[${i}] should be 0`);
            }
        });

        test('totalSize should match striders.totalBytesSize', () => {
            assert.strictEqual(allocator.totalSize, compiler.striders.totalBytesSize);
        });
    });

    // ==========================================================================
    // TEST SUITE 2: Wildcard Role
    // ==========================================================================
    describe('Test 2: Wildcard Role (COLLECTIONS → *)', () => {
        const ROLE_NAME = 'WILDCARD_ROLE';
        let compiler;
        let allocator;

        beforeEach(() => {

            
            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            //resourceInstance.AddResourceInstance('DOCUMENTS', 'doc_1');
            
            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['*'],  // WILDCARD
                        action: ['READ'],
                        boundary: 'ALL',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['*'],   // WILDCARD
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };
            
            compiler = new RoleCompiler(ROLE_NAME, roleDefinition);
            compiler.compile();
            allocator = new RowBinaryAllocator(ROLE_NAME, compiler);
        });

        test('should have wildcard index in pTi', () => {
            const parentId = TYPE_IDS.COLLECTIONS;
            const instances = allocator.getInstacesList(parentId);
            
            assert.ok(instances.has(STRIDER_SIZES.WILDCARD_INDEX));
        });

        test('should have globalStrider for wildcard parent', () => {
            const global = allocator.getGlobalStrider(TYPE_IDS.COLLECTIONS);
            
            assert.ok(global);
            assert.ok('shift' in global);
            assert.ok('totalNodeSize' in global);
        });

        test('translateWildCardGlobalToCompact should return compact index', () => {
            const parentId = TYPE_IDS.COLLECTIONS;
            const childType = TYPE_IDS.DOCUMENTS;
            const childGlobal = resourceInstance.getResourceInstanceIndex('DOCUMENTS', '*');
            
            const compact = allocator.translateWildCardGlobalToCompact(parentId, childType, childGlobal);
            
            assert.ok(typeof compact === 'number');
            assert.ok(compact >= 0);
        });

        test('translateWildCardGlobalToCompact should return -1 for non-existent child', () => {
            const parentId = TYPE_IDS.COLLECTIONS;
            const childType = TYPE_IDS.DOCUMENTS;
            
            const compact = allocator.translateWildCardGlobalToCompact(parentId, childType, 99999);
            assert.strictEqual(compact, -1);
        });
    });

    // ==========================================================================
    // TEST SUITE 3: Multiple Parent Instances
    // ==========================================================================
    describe('Test 3: Multiple Parent Instances', () => {
        const ROLE_NAME = 'MULTI_PARENT_ROLE';
        let compiler;
        let allocator;

        beforeEach(() => {

            
            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            resourceInstance.AddResourceInstance('COLLECTIONS', 'products_collection');
            resourceInstance.AddResourceInstance("SEARCH_INDEXES","search1");
            resourceInstance.AddResourceInstance('FIELD_METRICS', 'mat1');
            resourceInstance.AddResourceInstance('FIELD_METRICS', 'mat2');
            
            const roleDefinition = {
                'member_1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection', 'products_collection'],
                        action: ['READ', 'WRITE'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['mat1', 'mat2'],
                        nested: "SEARCH_INDEXES",
                        nestedInstance: ["search1"],
                        ttl: null
                    }
                }
            };
            
            compiler = new RoleCompiler(ROLE_NAME, roleDefinition);
            const cm=compiler.compile();
            
            allocator = new RowBinaryAllocator(ROLE_NAME, compiler);
        });

        test('should have both parent instances in pTi', () => {
            const parentId = TYPE_IDS.COLLECTIONS;
            const instances = allocator.getInstacesList(parentId);
           
            
            const usersIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            const productsIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'products_collection');
             
            assert.ok(instances.has(usersIndex));
            assert.ok(instances.has(+productsIndex));
            assert.strictEqual(instances.size, 2);
        });

        test('should have different shifts for different parent instances', () => {
            const parentId = TYPE_IDS.COLLECTIONS;
            const usersIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            const productsIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'products_collection');
            
            const shift1 = allocator.getinstanceStriderShift(parentId, usersIndex);
            const shift2 = allocator.getinstanceStriderShift(parentId, productsIndex);
            
            assert.notStrictEqual(shift1, shift2, 'Different parent instances should have different shifts');
        });

        test('should find child compact for both parent instances', () => {
            const childType = TYPE_IDS.FIELD_METRICS;
            const childGlobal = resourceInstance.getResourceInstanceIndex('FIELD_METRICS', 'mat1');
            
            const usersIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            const productsIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'products_collection');
            
            const compact1 = allocator.translateChildGlobalToCompact(usersIndex, childType, childGlobal);
            const compact2 = allocator.translateChildGlobalToCompact(productsIndex, childType, childGlobal);
            
            assert.ok(compact1 >= 0);
            assert.ok(compact2 >= 0);
        });
    });

    // ==========================================================================
    // TEST SUITE 4: Multiple Members in Same Role
    // ==========================================================================
    describe('Test 4: Multiple Members', () => {
        const ROLE_NAME = 'MULTI_MEMBER_ROLE';
        let compiler;
        let allocator;

        beforeEach(() => {

            
            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
           
            resourceInstance.AddResourceInstance("SEARCH_INDEXES","search1");
            resourceInstance.AddResourceInstance('FIELD_METRICS', 'mat1');
            resourceInstance.AddResourceInstance('FIELD_METRICS', 'mat2');
            
            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: ['READ'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: [1],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                },
                'member_2': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: ['READ', 'WRITE'],
                        boundary: 'ALL',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['mat1'],
                        nested: "SEARCH_INDEXES",
                        nestedInstance: ['search1'],
                        ttl: null
                    }
                }
            };
            
            compiler = new RoleCompiler(ROLE_NAME, roleDefinition);
            const cm=compiler.compile();
            
            allocator = new RowBinaryAllocator(ROLE_NAME, compiler);
        });

        test('should have both child types in compact tree', () => {
            const parentGlobal = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            
            const docsCompact = allocator.translateChildGlobalToCompact(
                parentGlobal, 
                TYPE_IDS.DOCUMENTS, 
                resourceInstance.getResourceInstanceIndex('DOCUMENTS', 'doc_1')
            );
            
            const prodsCompact = allocator.translateChildGlobalToCompact(
                parentGlobal, 
                TYPE_IDS.FIELD_METRICS, 
                resourceInstance.getResourceInstanceIndex('FIELD_METRICS', 'mat1')
            );
            
            assert.ok(docsCompact >= 0);
            assert.ok(prodsCompact >= 0);
        });

        test('should have both parent instances in pTi', () => {
            const parentId = TYPE_IDS.COLLECTIONS;
            const instances = allocator.getInstacesList(parentId);
            assert.strictEqual(instances.size, 1); // Same parent, one instance
        });
    });

    // ==========================================================================
    // TEST SUITE 5: Role with TTL
    // ==========================================================================
    describe('Test 5: Role with TTL', () => {
        const ROLE_NAME = 'TTL_ROLE';
        let compiler;
        let allocator;

        beforeEach(() => {

            
            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            
            
            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: ['READ'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: '1h'  // 1 hour TTL
                    }
                }
            };
            
            compiler = new RoleCompiler(ROLE_NAME, roleDefinition);
            compiler.compile();
            allocator = new RowBinaryAllocator(ROLE_NAME, compiler);
        });

        test('should compile successfully with TTL', () => {
            assert.ok(allocator.buffer.length > 0);
        });

        test('should have striders configured correctly', () => {
            const parentId = TYPE_IDS.COLLECTIONS;
            const instanceIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            
            const sizeMap = allocator.getinstanceStriderSize(parentId, instanceIndex);
            const offsetMap = allocator.getinstanceStriderOffset(parentId, instanceIndex);
            
            assert.ok(sizeMap);
            assert.ok(offsetMap);
        });
    });

    // ==========================================================================
    // TEST SUITE 6: Nested Role (Parent → Child → GrandChild)
    // ==========================================================================
    describe('Test 6: Nested Role (COLLECTIONS → SEARCH_INDEXES → FIELD_METRICS)', () => {
        const ROLE_NAME = 'NESTED_ROLE';
        let compiler;
        let allocator;

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
            allocator = new RowBinaryAllocator(ROLE_NAME, compiler);
        });

        test('should compile nested role successfully', () => {
            assert.ok(allocator.buffer.length > 0);
        });

        test('should have nested child in compact tree', () => {
            const parentGlobal = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            
            const nestedCompact = allocator.translateChildGlobalToCompact(
                parentGlobal,
                TYPE_IDS.SEARCH_INDEXES,
                resourceInstance.getResourceInstanceIndex('SEARCH_INDEXES', 'idx_1')
            );
            
            assert.ok(nestedCompact >= 0);
        });

        test('should have grandchild in compact tree', () => {
            const parentGlobal = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            
            const grandchildCompact = allocator.translateChildGlobalToCompact(
                parentGlobal,
                TYPE_IDS.FIELD_METRICS,
                resourceInstance.getResourceInstanceIndex('FIELD_METRICS', 'metric_1')
            );
            
            assert.ok(grandchildCompact >= 0);
        });

        test('should have striders for nested resources', () => {
            const parentId = TYPE_IDS.COLLECTIONS;
            const instanceIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            
            const sizeMap = allocator.getinstanceStriderSize(parentId, instanceIndex);
            
            // Should contain both SEARCH_INDEXES and FIELD_METRICS
            assert.ok(TYPE_IDS.SEARCH_INDEXES in sizeMap);
            assert.ok(TYPE_IDS.FIELD_METRICS in sizeMap);
        });
    });

    // ==========================================================================
    // TEST SUITE 7: Edge Cases
    // ==========================================================================
    describe('Test 7: Edge Cases', () => {
        test('should handle role with single instance', () => {

            resourceInstance.AddResourceInstance('COLLECTIONS', 'single_collection');
            resourceInstance.AddResourceInstance('DOCUMENTS', 'single_doc');
            
            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['single_collection'],
                        action: ['READ'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['single_doc'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };
            
            const compiler = new RoleCompiler('SINGLE_ROLE', roleDefinition);
            compiler.compile();
            const allocator = new RowBinaryAllocator('SINGLE_ROLE', compiler);
            
            assert.ok(allocator.buffer.length > 0);
        });

        test('should handle role with multiple actions', () => {

            resourceInstance.AddResourceInstance('COLLECTIONS', 'coll_1');
            
            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['coll_1'],
                        action: ['READ', 'WRITE', 'UPDATE', 'DELETE'],
                        boundary: 'ALL',
                        actionToOthers: ['READ', 'WRITE'],
                        boundaryToOthers: 'LIMITED',
                        ownerInstance: ['doc_1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };
            
            const compiler = new RoleCompiler('MULTI_ACTION_ROLE', roleDefinition);
            compiler.compile();
            const allocator = new RowBinaryAllocator('MULTI_ACTION_ROLE', compiler);
            
            assert.ok(allocator.buffer.length > 0);
        });

        test('should handle role with boundary OWN vs ALL', () => {

            resourceInstance.AddResourceInstance('COLLECTIONS', 'coll_1');
            
            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['coll_1'],
                        action: ['READ'],
                        boundary: 'OWN',
                        actionToOthers: ['READ'],
                        boundaryToOthers: 'ALL',
                        ownerInstance: ['doc_1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };
            
            const compiler = new RoleCompiler('BOUNDARY_ROLE', roleDefinition);
            compiler.compile();
            const allocator = new RowBinaryAllocator('BOUNDARY_ROLE', compiler);
            
            assert.ok(allocator.buffer.length > 0);
        });
    });

    // ==========================================================================
    // TEST SUITE 8: Performance Tests
    // ==========================================================================
    describe('Test 8: Performance', () => {
        test('should create allocator quickly for large role', () => {

            resourceInstance.AddResourceInstance("SEARCH_INDEXES","search1");
            
            // Create many instances
            for (let i = 0; i < 100; i++) {
                resourceInstance.AddResourceInstance('COLLECTIONS', `coll_${i}`);
                resourceInstance.AddResourceInstance('FIELD_METRICS', `mat_${i}`);
            }
            
            const parentInstances = Array.from({ length: 100 }, (_, i) => `coll_${i}`);
            const ownerInstances = Array.from({ length: 100 }, (_, i) => `mat_${i}`);
            
            const roleDefinition = {
                'member_1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: parentInstances,
                        action: ['READ', 'WRITE'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ownerInstances,
                        nested: "SEARCH_INDEXES",
                        nestedInstance: ["search1"],
                        ttl: null
                    }
                }
            };
            
            const startCompile = performance.now();
            const compiler = new RoleCompiler('PERF_ROLE', roleDefinition);
             const cm=compiler.compile();
            
            const compileTime = performance.now() - startCompile;
            
            const startAlloc = performance.now();
            const allocator = new RowBinaryAllocator('PERF_ROLE', compiler);
            const allocTime = performance.now() - startAlloc;
            
            assert.ok(allocator.buffer.length > 0);
            console.log(`Compile time: ${compileTime.toFixed(2)}ms, Allocation time: ${allocTime.toFixed(2)}ms`);
        });

        test('translateChildGlobalToCompact should be O(1)', () => {

            resourceInstance.AddResourceInstance("SEARCH_INDEXES","search1");
            resourceInstance.AddResourceInstance('COLLECTIONS', 'coll_1');
            
            for (let i = 0; i < 1000; i++) {
                resourceInstance.AddResourceInstance('FIELD_METRICS', `mat_${i}`);
            }
            
            const ownerInstances = Array.from({ length: 1000 }, (_, i) => `mat_${i}`);
            
            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['coll_1'],
                        action: ['READ'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ownerInstances,
                        nested:"SEARCH_INDEXES",
                        nestedInstance: ["search1"],
                        ttl: null
                    }
                }
            };
            
            const compiler = new RoleCompiler('FAST_ROLE', roleDefinition);
            compiler.compile();
            const allocator = new RowBinaryAllocator('FAST_ROLE', compiler);
            
            const parentGlobal = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'coll_1');
            const childType = TYPE_IDS.FIELD_METRICS;
            
            const start = performance.now();
            for (let i = 0; i < 1000; i++) {
                const childGlobal = resourceInstance.getResourceInstanceIndex('FIELD_METRICS', `mat_${i}`);
                allocator.translateChildGlobalToCompact(parentGlobal, childType, childGlobal);
            }
            const duration = performance.now() - start;
            
            assert.ok(duration < 50, `translateChildGlobalToCompact should be fast, took ${duration}ms`);
        });
    });
});