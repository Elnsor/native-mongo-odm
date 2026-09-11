
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { resourceInstance } from '../rbac/buckets/systemReourcesInstances.js';
import { RoleCompiler } from '../rbac/compiler/schema-parser.js';
import { RoleBinaryWorker } from '../rbac/allocator/binary-worker.js';
import { 
    TYPE_IDS, 
    STRIDER_SIZES, 
    SYSTEM_STATUS,
    SIZE_POWER,
    DEFAULT_ACTIONS,
    BOUNDARY
} from '../rbac/constant/resourceType.js';
import { buffer } from 'node:stream/consumers';

describe('RoleBinaryWorker - Integration Tests with Real GroupRole', () => {
    
    beforeEach(() => {
        // Reset singleton state
        resourceInstance.reset();
        SIZE_POWER.WILDCARD = 32;
    });

    // ==========================================================================
    // TEST SUITE 1: Nested Role (COLLECTIONS → SEARCH_INDEXES → FIELD_METRICS)
    // ==========================================================================
    describe('Test 1: Nested Role with GrandChild', () => {
        const ROLE_NAME = 'NESTED_WORKER_ROLE';
        let compiler;
         /**
             * @type {RoleBinaryWorker} worker
             */
        let worker;

        beforeEach(() => {
            // 1. Register Role
           
            
            // 2. Register Instances (using correct hierarchy)
            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            resourceInstance.AddResourceInstance('SEARCH_INDEXES', 'idx_1');
            resourceInstance.AddResourceInstance('SEARCH_INDEXES', 'idx_2');
            resourceInstance.AddResourceInstance('FIELD_METRICS', 'metric_1');
            resourceInstance.AddResourceInstance('FIELD_METRICS', 'metric_2');
            
            // 3. Define Real Role with Nested Structure
            const roleDefinition = {
                'member_1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: ['READ', 'UPDATE'],
                        boundary: 'OWN',
                        actionToOthers: ['READ'],
                        boundaryToOthers: 'ALL',
                        ownerInstance: ['metric_1', 'metric_2'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['idx_1'],
                        ttl: null
                    }
                }
            };
            
            // 4. Compile Role
            compiler = new RoleCompiler(ROLE_NAME, roleDefinition);
            const compileResult = compiler.compile();
            assert.strictEqual(compileResult, true, 'Compilation should succeed');
            
            // 5. Create Worker
            worker = new RoleBinaryWorker(ROLE_NAME, compiler);
        });

        // ======================================================================
        // 1.1 Constructor & Inheritance Tests
        // ======================================================================
        test('should inherit from RowBinaryAllocator', () => {
            assert.ok(worker.groupRolesPid !== undefined);
            assert.ok(worker.buffer !== undefined);
            assert.ok(worker.striders !== undefined);
        });

        test('should initialize with correct groupRolesPid', () => {
            const expectedPid = resourceInstance.getRoleId(ROLE_NAME);
            assert.strictEqual(worker.groupRolesPid, expectedPid);
        });

        test('should create buffer with correct size', () => {
            assert.ok(worker.buffer.length > 0);
            assert.strictEqual(worker.buffer.length, worker.totalSize);
        });

        // ======================================================================
        // 1.2 setWorkerRoleId Tests
        // ======================================================================
      

        // ======================================================================
        // 1.3 setWorkerValueToAddr & getEffectedValue Tests
        // ======================================================================
        test('setWorkerValueToAddr should write value at specific address', () => {
            worker.setWorkerValueToAddr(10, 42);
            assert.strictEqual(worker.buffer[10], 42);
        });

        test('getEffectedValue should read value from specific address', () => {

            worker.setWorkerValueToAddr(worker.buffer.length-1,99);
            
            const value = worker.getEffectedValue(worker.buffer.length-1);
            assert.strictEqual(value, 99);
        });

        // ======================================================================
        // 1.4 geteffected Tests (Address Calculation with GrandChild)
        // ======================================================================
        test('geteffected should return shift address when fetchGroupRole=true, value=false', () => {
            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            
            const result = worker.geteffected(
                worker.groupRolesPid, 
                parentPid, 
                parentIndex, 
                null, 
                null, 
                null, 
                null, 
                true, 
                false
            );
            
            assert.strictEqual(typeof result, 'number');
            assert.ok(result >= 0);
        });

        test('geteffected should return roleId value when fetchGroupRole=true, value=true', () => {
           
            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            worker.addRolesValuseToRowBinary();
            
            const result = worker.geteffected(
                worker.groupRolesPid, 
                parentPid, 
                parentIndex, 
                null, 
                null, 
                null, 
                null, 
                true, 
                true
            );
            
               
            assert.strictEqual(result, worker.groupRolesPid);
        });

        test('geteffected should return error for mismatched GroupRoleId', () => {
            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            
            const result = worker.geteffected(
                9999, 
                parentPid, 
                parentIndex, 
                null, 
                null, 
                null, 
                null, 
                false, 
                false
            );
            
            assert.strictEqual(result.code, SYSTEM_STATUS.ROLE_MISMATCH_INSTANCE);
        });

        test('geteffected should calculate child (SEARCH_INDEXES) address correctly', () => {
            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            const childPid = TYPE_IDS.SEARCH_INDEXES;
            const childIndex = resourceInstance.getResourceInstanceIndex('SEARCH_INDEXES', 'idx_1');
            const chcom=worker.translateChildGlobalToCompact(parentIndex,childPid,childIndex);
            
            const result = worker.geteffected(
                worker.groupRolesPid, 
                parentPid, 
                parentIndex, 
                childPid, 
                chcom, 
                null, 
                null, 
                false, 
                false
            );
            
            assert.strictEqual(typeof result, 'number');
            assert.ok(result >= 0);
            
            assert.ok(result < worker.buffer.length);
        });

        test('geteffected should calculate grandchild (FIELD_METRICS) address correctly', () => {
            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            const childPid = TYPE_IDS.SEARCH_INDEXES;
            const childIndex = resourceInstance.getResourceInstanceIndex('SEARCH_INDEXES', 'idx_1');
            const grandChildPid = TYPE_IDS.FIELD_METRICS;
            const grandChildIndex = resourceInstance.getResourceInstanceIndex('FIELD_METRICS', 'metric_1');
            const comchild=worker.translateChildGlobalToCompact(parentIndex,childPid,childIndex);
            const comgchild=worker.translateChildGlobalToCompact(parentIndex,grandChildPid,grandChildIndex)
            
            const result = worker.geteffected(
                worker.groupRolesPid, 
                parentPid, 
                parentIndex, 
                childPid, 
                comchild, 
                grandChildPid, 
                comgchild, 
                false, 
                false
            );
            
            assert.strictEqual(typeof result, 'number');
            assert.ok(result >= 0);
            assert.ok(result < worker.buffer.length);
        });

        test('geteffected should return error for undefined parentId', () => {
            const result = worker.geteffected(
                worker.groupRolesPid, 
                undefined, 
                0, 
                null, 
                null, 
                null, 
                null, 
                false, 
                false
            );
            
            assert.strictEqual(result.code, SYSTEM_STATUS.INVALID_RESOURCE_PID);
        });

        // ======================================================================
        // 1.5 geteffectedAccess Tests (Access with TTL and GrandChild)
        // ======================================================================
        test('geteffectedAccess should return effects value when no TTL', async () => {
            // Populate buffer
            worker.addRolesValuseToRowBinary();
            
            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            const childPid = TYPE_IDS.SEARCH_INDEXES;
            const childIndex = resourceInstance.getResourceInstanceIndex('SEARCH_INDEXES', 'idx_1');
            const grandChildPid = TYPE_IDS.FIELD_METRICS;
            const grandChildIndex = resourceInstance.getResourceInstanceIndex('FIELD_METRICS', 'metric_1');
             const comchild=worker.translateChildGlobalToCompact(parentIndex,childPid,childIndex);
            const comgchild=worker.translateChildGlobalToCompact(parentIndex,grandChildPid,grandChildIndex)
            
            
            
            const result = worker.geteffectedAccess(
                worker.groupRolesPid,
                parentPid,
                parentIndex,
                childPid,
                comchild,
                grandChildPid,
                comgchild
            );
            
            // Should return effects value (number)
            assert.strictEqual(typeof result, 'number');
            assert.ok(result > 0);
        });

        test('geteffectedAccess should return error for mismatched GroupRoleId', () => {
            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            const childPid = TYPE_IDS.SEARCH_INDEXES;
            const childIndex = resourceInstance.getResourceInstanceIndex('SEARCH_INDEXES', 'idx_1');
            const grandChildPid = TYPE_IDS.FIELD_METRICS;
            const grandChildIndex = resourceInstance.getResourceInstanceIndex('FIELD_METRICS', 'metric_1');
            
            const result = worker.geteffectedAccess(
                9999,
                parentPid,
                parentIndex,
                childPid,
                childIndex,
                grandChildPid,
                grandChildIndex
            );
            
            assert.strictEqual(result.code, SYSTEM_STATUS.ROLE_MISMATCH_INSTANCE);
        });

        // ======================================================================
        // 1.6 setWorkerValue Tests (with GrandChild)
        // ======================================================================
        test('setWorkerValue should set value with grandchild', () => {
            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            const childPid = TYPE_IDS.SEARCH_INDEXES;
            const childIndex = resourceInstance.getResourceInstanceIndex('SEARCH_INDEXES', 'idx_1');
            const grandChildPid = TYPE_IDS.FIELD_METRICS;
            const grandChildIndex = resourceInstance.getResourceInstanceIndex('FIELD_METRICS', 'metric_1');
             const comchild=worker.translateChildGlobalToCompact(parentIndex,childPid,childIndex);
            const comgchild=worker.translateChildGlobalToCompact(parentIndex,grandChildPid,grandChildIndex)
            
                       
            const effects = DEFAULT_ACTIONS.READ | DEFAULT_ACTIONS.UPDATE | BOUNDARY.OWN;
            
            const result = worker.setWorkerValue(
                effects,
                worker.groupRolesPid,
                0, // memberId
                parentPid,
                parentIndex,
                childPid,
                comchild,
                grandChildPid,
                comgchild,
                null // no TTL
            );
            
            assert.strictEqual(result, true);
        });

        test('setWorkerValue should set value with TTL', () => {
            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            const childPid = TYPE_IDS.SEARCH_INDEXES;
            const childIndex = resourceInstance.getResourceInstanceIndex('SEARCH_INDEXES', 'idx_1');
            const grandChildPid = TYPE_IDS.FIELD_METRICS;
            const grandChildIndex = resourceInstance.getResourceInstanceIndex('FIELD_METRICS', 'metric_2');
             const comchild=worker.translateChildGlobalToCompact(parentIndex,childPid,childIndex);
             const comgchild=worker.translateChildGlobalToCompact(parentIndex,grandChildPid,grandChildIndex)
            
            
            
            const effects = DEFAULT_ACTIONS.READ | BOUNDARY.OWN;
            const futureTTL = Math.floor(Date.now() / 1000) + 3600; // 1 hour
            
            const result = worker.setWorkerValue(
                effects,
                worker.groupRolesPid,
                0,
                parentPid,
                parentIndex,
                childPid,
              comchild,
                grandChildPid,
                comgchild,
                futureTTL
            );
            
            assert.strictEqual(result, true);
        });

        // ======================================================================
        // 1.7 addRolesValuseToRowBinary Tests (Integration)
        // ======================================================================
        test('addRolesValuseToRowBinary should populate buffer from pathsBuffer', () => {
            const result = worker.addRolesValuseToRowBinary();
            assert.strictEqual(result, true);
            
            // Verify buffer was populated
            assert.strictEqual(worker.buffer[0], worker.groupRolesPid);
        });

        test('addRolesValuseToRowBinary should handle multiple path entries', () => {
            // Compile a role with multiple entries
            const multiRoleDefinition = {
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
                        action: ['UPDATE'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['metric_2'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['idx_2'],
                        ttl: null
                    }
                }
            };
            
            const multiCompiler = new RoleCompiler('MULTI_MEMBER_ROLE', multiRoleDefinition);
            multiCompiler.compile();
            const multiWorker = new RoleBinaryWorker('MULTI_MEMBER_ROLE', multiCompiler);
            
            const result = multiWorker.addRolesValuseToRowBinary();
            assert.strictEqual(result, true);
        });
    });

    // ==========================================================================
    // TEST SUITE 2: Simple Role (COLLECTIONS → SEARCH_INDEXES)
    // ==========================================================================
    describe('Test 2: Simple Role (Parent → Child)', () => {
        const ROLE_NAME = 'SIMPLE_WORKER_ROLE';
        let compiler;
        let worker;

        beforeEach(() => {
           
            
            resourceInstance.AddResourceInstance('COLLECTIONS', 'products_collection');
            resourceInstance.AddResourceInstance('SEARCH_INDEXES', 'idx_1');
            resourceInstance.AddResourceInstance('SEARCH_INDEXES', 'idx_2');
            
            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['products_collection'],
                        action: ['READ', 'WRITE', 'UPDATE'],
                        boundary: 'OWN',
                        actionToOthers: ['READ'],
                        boundaryToOthers: 'ALL',
                        ownerInstance: [1],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };
            
            compiler = new RoleCompiler(ROLE_NAME, roleDefinition);
            compiler.compile();
            worker = new RoleBinaryWorker(ROLE_NAME, compiler);
        });

        test('should create worker with correct buffer size', () => {
            assert.ok(worker.buffer.length > 0);
        });

        test('setWorkerValue should set value without grandchild', () => {
            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'products_collection');
            const childPid = TYPE_IDS.DOCUMENTS;
            const childIndex = resourceInstance.getResourceInstanceIndex('DOCUMENTS', 'idx_1');
            const comchild=worker.translateChildGlobalToCompact(parentIndex,childPid,childIndex);
            
            const effects = DEFAULT_ACTIONS.READ | DEFAULT_ACTIONS.WRITE | BOUNDARY.OWN;
            
            const result = worker.setWorkerValue(
                effects,
                worker.groupRolesPid,
                0,
                parentPid,
                parentIndex,
                childPid,
                comchild,
                null, // no grandchild
                null,
                null
            );
            
            assert.strictEqual(result, true);
        });

        test('geteffectedAccess should return effects value', async () => {
            worker.addRolesValuseToRowBinary();
            
            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'products_collection');
            const childPid = TYPE_IDS.DOCUMENTS;
            const childIndex = resourceInstance.getResourceInstanceIndex('DOCUMENTS', 'idx_1');
            const comchild = worker.translateChildGlobalToCompact(parentIndex,childPid,childIndex);
            
            const result = worker.geteffectedAccess(
                worker.groupRolesPid,
                parentPid,
                parentIndex,
                childPid,
                comchild,
                null,
                null
            );
            
            assert.strictEqual(typeof result, 'number');
            assert.ok(result > 0);
        });
    });

    // ==========================================================================
    // TEST SUITE 3: Wildcard Role
    // ==========================================================================
    describe('Test 3: Wildcard Role', () => {
        const ROLE_NAME = 'WILDCARD_WORKER_ROLE';
        let compiler;
        /**
         * @type {RoleBinaryWorker}
         */
        let worker;

        beforeEach(() => {
           
            
            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            resourceInstance.AddResourceInstance('SEARCH_INDEXES', 'idx_1');
            
            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['*'], // WILDCARD
                        action: ['READ'],
                        boundary: 'ALL',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['*'], // WILDCARD
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };
            
            compiler = new RoleCompiler(ROLE_NAME, roleDefinition);
            compiler.compile();
            worker = new RoleBinaryWorker(ROLE_NAME, compiler);
        });

        test('should have globalStrider for wildcard parent', () => {
            const global = worker.getGlobalStrider(TYPE_IDS.COLLECTIONS);
            assert.ok(global);
            assert.ok('shift' in global);
            assert.ok('totalNodeSize' in global);
        });

        test('addRolesValuseToRowBinary should handle wildcard', () => {
            const result = worker.addRolesValuseToRowBinary();
            assert.strictEqual(result, true);
        });
    });

    // ==========================================================================
    // TEST SUITE 4: Role with TTL
    // ==========================================================================
    describe('Test 4: Role with TTL', () => {
        const ROLE_NAME = 'TTL_WORKER_ROLE';
        let compiler;
        let worker;

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
                        ttl: '1h' // 1 hour TTL
                    }
                }
            };
            
            compiler = new RoleCompiler(ROLE_NAME, roleDefinition);
            compiler.compile();
            worker = new RoleBinaryWorker(ROLE_NAME, compiler);
        });

        test('should compile successfully with TTL', () => {
            assert.ok(worker.buffer.length > 0);
        });

        test('addRolesValuseToRowBinary should populate TTL in buffer', () => {
            const result = worker.addRolesValuseToRowBinary();
            assert.strictEqual(result, true);
            
            // Verify TTL is in buffer (should be > 0)
            let foundTTL = false;
            for (let i = 0; i < worker.buffer.length; i++) {
                if (worker.buffer[i] > Math.floor(Date.now() / 1000)) {
                    foundTTL = true;
                    break;
                }
            }
            assert.strictEqual(foundTTL, true, 'Should have TTL timestamp in buffer');
        });
    });

    // ==========================================================================
    // TEST SUITE 5: Buffer Integrity
    // ==========================================================================
    describe('Test 5: Buffer Integrity', () => {
        const ROLE_NAME = 'BUFFER_INTEGRITY_ROLE';
        let worker;

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
            
            const compiler = new RoleCompiler(ROLE_NAME, roleDefinition);
            compiler.compile();
            worker = new RoleBinaryWorker(ROLE_NAME, compiler);
            worker.addRolesValuseToRowBinary();
        });

        test('should have non-zero buffer size', () => {
            assert.ok(worker.buffer.length > 0);
        });

        test('should have roleId at buffer[0]', () => {
            const roleId = resourceInstance.getRoleId(ROLE_NAME);
            assert.strictEqual(worker.buffer[0], roleId);
        });

        test('should have compact tree populated', () => {
            assert.ok(worker.childCompactTree.size > 0);
        });

        test('should have striders populated', () => {
            assert.ok(Object.keys(worker.striders).length > 0);
            assert.ok(worker.striders.totalBytesSize > 0);
        });
    });
});