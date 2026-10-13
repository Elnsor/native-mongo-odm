import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

import { resourceInstance } from './../rbac/buckets/systemReourcesInstances.js';
import { 
    TYPE_IDS, 
    RESOURCES_CHILD, 
    TYPE_ID_TAG, 
    EFFECT_ACTION, 
    SYSTEM_STATUS,
    STRIDER_SIZES 
} from './../rbac/constant/resourceType.js';


const { ResourceRoleGroupManager }  = await import( './../rbac/compiler/base-manager.js');

describe('ResourceRoleGroupManager', () => {
    const ROLE_NAME = 'TEST_MANAGER_ROLE';
    /**
     * @type {import("../rbac/compiler/base-manager.js").ResourceRoleGroupManager}
     */
    let manager;

    beforeEach(() => {
        resourceInstance.reset();
        // Ensure base resources exist for tests
        resourceInstance.AddResourceInstance('COLLECTIONS', 'users');
        resourceInstance.AddResourceInstance('COLLECTIONS', 'products');
        resourceInstance.AddResourceInstance('SEARCH_INDEXES', 'sear1');
        resourceInstance.AddResourceInstance('FIELD_METRICS', 'mat1');
    });

    afterEach(() => {
        resourceInstance.reset();
    });

    // ==========================================================================
    // SUITE 1: Constructor & Initialization
    // ==========================================================================
    describe('Constructor & Initialization', () => {
        it('should initialize successfully and register role', () => {
            const roles = { 'member_1': {} };
            manager = new ResourceRoleGroupManager(ROLE_NAME, roles);
            
            assert.strictEqual(manager.groupRoleName, ROLE_NAME);
            assert.strictEqual(manager.ListOfGroups, roles);
            assert.ok(manager._pathsBuffer instanceof Uint32Array);
            assert.strictEqual(manager._pathsBuffer.length, STRIDER_SIZES.PATHS_BUFFER_SIZE);
            assert.ok(manager.schemaSlices instanceof Map);
            assert.ok(manager.pTi instanceof Map);
            
            // Verify role was added to resourceInstance
            const roleId = resourceInstance.getRoleId(ROLE_NAME);
            assert.strictEqual(typeof roleId, 'number');
        });

        it('should skip role registration if update=true', () => {
            resourceInstance.AddRole('EXISTING_ROLE');
            // Should not throw even though role exists, because update=true
            assert.doesNotThrow(() => {
                manager = new ResourceRoleGroupManager('EXISTING_ROLE', {}, true);
            });
        });

        it('should throw error if role registration fails (and update=false)', () => {
            resourceInstance.AddRole('DUPLICATE_ROLE');
            assert.throws(() => {
                new ResourceRoleGroupManager('DUPLICATE_ROLE', {}, false);
            }, /ResourceRole Error:/);
        });
    });

    // ==========================================================================
    // SUITE 2: Path Buffer Management
    // ==========================================================================
    describe('Path Buffer Management', () => {
        beforeEach(() => {
            manager = new ResourceRoleGroupManager(ROLE_NAME, {});
        });

        it('should set path buffer correctly', () => {
            manager.setPathBuffer(1, 0, 100, 0, 102, 0, 103, 0, 17, 3600);
            
            assert.strictEqual(manager._pathsBufferInstanceCounts, 1);
            assert.strictEqual(manager._pathsBuffer[0], 1);   // roleId
            assert.strictEqual(manager._pathsBuffer[1], 0);   // memberId
            assert.strictEqual(manager._pathsBuffer[2], 100); // pType
            assert.strictEqual(manager._pathsBuffer[3], 0);   // pIndex
            assert.strictEqual(manager._pathsBuffer[8], 17);  // effects
            assert.strictEqual(manager._pathsBuffer[9], 3600);// ttl
        });

        it('should dynamically expand buffer when capacity is reached', () => {
            const initialLength = manager.pathBuffersSize
            const maxEntries = initialLength / 10;
          
            
            // Fill to capacity
            for (let i = 0; i < maxEntries-1; i++) {
                manager.setPathBuffer(1, 0, 100, 0, 102, 0, 103, 0, 17, 0);
            }
            console.log("--+++--size",manager.pathBuffersSize)
            console.log("----size",manager.pathBuffersSize,manager.pathBuffersUsageSize,manager.pathBuffersInstanceCount)
            
            assert.strictEqual(manager.pathBuffersSize, initialLength);
            
            // Trigger expansion
            manager.setPathBuffer(1, 0, 100, 0, 102, 0, 103, 0, 17, 0);
            
            assert.strictEqual(manager.pathBuffersSize, initialLength * 2);
            assert.strictEqual(manager.pathBuffersInstanceCount, parseInt( maxEntries + 1));
        });

        it('should return correct sliced paths buffer', () => {
            manager.setPathBuffer(1, 0, 100, 0, 102, 0, 0, 0, 17, 0);
            const buffer = manager.getPathsBuffer();
            
            assert.strictEqual(buffer.length, 10);
            assert.ok(buffer instanceof Uint32Array);
        });
    });

    // ==========================================================================
    // SUITE 3: Getter Methods
    // ==========================================================================
    describe('Getter Methods', () => {
        beforeEach(() => {
            manager = new ResourceRoleGroupManager(ROLE_NAME, {});
            manager.pTi.set(100, { instance: new Set([0]) });
            manager.schemaSlices.set(100, new Map([[0, { name: 'test' }]]));
        });

        it('getPTI should return pTi map', () => {
            assert.strictEqual(manager.getPTI(), manager.pTi);
        });

        it('getSchemaSlice should return schemaSlices map', () => {
            assert.strictEqual(manager.getSchemaSlice(), manager.schemaSlices);
        });

        it('getSchemaSliceByParentPID should return correct slice', () => {
            const slice = manager.getSchemaSliceByParentPID(100);
            assert.ok(slice instanceof Map);
            assert.strictEqual(slice.get(0).name, 'test');
        });

        it('getSchemaSliceByParentInsPID should return correct instance slice', () => {
            const slice = manager.getSchemaSliceByParentInsPID(100, 0);
            assert.deepStrictEqual(slice, { name: 'test' });
        });

        it('getSchemaSliceByParentName should return correct slice', () => {
            const slice = manager.getSchemaSliceByParentName('COLLECTIONS');
            assert.ok(slice instanceof Map);
        });

        it('getSchemaSliceByParentInsName should return correct instance slice', () => {
            const slice = manager.getSchemaSliceByParentInsName('COLLECTIONS', 'users');
            assert.deepStrictEqual(slice, { name: 'test' });
        });
    });

    // ==========================================================================
    // SUITE 4: validateRolElement - Happy Paths
    // ==========================================================================
    describe('validateRolElement - Happy Paths', () => {
        beforeEach(() => {
            manager = new ResourceRoleGroupManager(ROLE_NAME, {});
        });

        it('should validate simple parent -> leaf hierarchy', () => {
            const element = {
                parentResource: 'COLLECTIONS',
                parentInstance: ['users'],
                action: 'RO',
                actionToOthers: 'NONE',
                ownerInstance: ['mat1'],
                nested:'SEARCH_INDEXES',
                nestedInstance: ['sear1'],
                ttl: '1h'
            };
            const result = manager.validateRolElement('FIELD_METRICS', element);
            assert.strictEqual(result, 0);
        });

        it('should validate nested parent -> nested -> leaf hierarchy', () => {
            const element = {
                parentResource: 'COLLECTIONS',
                parentInstance: ['users'],
                action: 'RWO',
                actionToOthers: 'RO',
                ownerInstance: [{ name: 'mat1', ttl: '1d' }],
                nested: 'SEARCH_INDEXES',
                nestedInstance: ['sear1'],
                ttl: 0
            };
            const result = manager.validateRolElement('FIELD_METRICS', element);
            assert.strictEqual(result, 0);
        });

        it('should validate wildcard parent and owner instances', () => {
            const element = {
                parentResource: 'COLLECTIONS',
                parentInstance: ['*'],
                action: 'RWUDA',
                actionToOthers: 'NONE',
                ownerInstance: ['*'],
                nested: 'SEARCH_INDEXES',
                nestedInstance: ['*']
            };
            const result = manager.validateRolElement('FIELD_METRICS', element);
            assert.strictEqual(result, 0);
        });
    });

    // ==========================================================================
    // SUITE 5: validateRolElement - Error Catches & Edge Cases
    // ==========================================================================
    describe('validateRolElement - Error Catches & Edge Cases', () => {
        beforeEach(() => {
            manager = new ResourceRoleGroupManager(ROLE_NAME, {});
        });

        it('should catch invalid parent resource', () => {
            const result = manager.validateRolElement('FIELD_METRICS', {
                parentResource: 'INVALID_RESOURCE',
                parentInstance: ['users'],
                action: 'RO',
                actionToOthers: 'NONE',
                ownerInstance: ['mat1']
            });
            assert.strictEqual(result.code, SYSTEM_STATUS.INVALID_RESOURCE_PID);
        });

        it('should catch empty or non-array parentInstance', () => {
            const result = manager.validateRolElement('FIELD_METRICS', {
                parentResource: 'COLLECTIONS',
                parentInstance: [],
                action: 'RO',
                actionToOthers: 'NONE',
                ownerInstance: ['mat1']
            });
            assert.strictEqual(result.code, SYSTEM_STATUS.RESOURCES_EMPTY_LIST);
        });

        it('should catch mixed wildcard in parentInstance', () => {
            const result = manager.validateRolElement('FIELD_METRICS', {
                parentResource: 'COLLECTIONS',
                parentInstance: ['users', '*'],
                action: 'RO',
                actionToOthers: 'NONE',
                ownerInstance: ['mat1']
            });
            assert.strictEqual(result.code, SYSTEM_STATUS.INVALID_SCHEMA);
        });

        it('should catch invalid leaf resource', () => {
            const result = manager.validateRolElement('INVALID_LEAF', {
                parentResource: 'COLLECTIONS',
                parentInstance: ['users'],
                action: 'RO',
                actionToOthers: 'NONE',
                ownerInstance: ['mat1']
            });
            assert.strictEqual(result.code, SYSTEM_STATUS.INVALID_RESOURCE_PID);
        });

        it('should catch leaf resource that acts as a parent', () => {
            // COLLECTIONS is a parent, cannot be a leaf
            const result = manager.validateRolElement('COLLECTIONS', {
                parentResource: 'DB',
                parentInstance: ['main_db'],
                action: 'RO',
                actionToOthers: 'NONE',
                ownerInstance: ['mat1']
            });
            assert.strictEqual(result.code, SYSTEM_STATUS.INVALID_SCHEMA);
        });

        it('should catch tagged leaf missing ownerInstance', () => {
            // FIELD_METRICS is tagged
            const result = manager.validateRolElement('FIELD_METRICS', {
                parentResource: 'COLLECTIONS',
                parentInstance: ['users'],
                action: 'RO',
                actionToOthers: 'NONE',
                ownerInstance: [] // Empty
            });
            assert.strictEqual(result.code, SYSTEM_STATUS.RESOURCES_EMPTY_LIST);
        });

        it('should catch mixed wildcard in ownerInstance', () => {
            const result = manager.validateRolElement('FIELD_METRICS', {
                parentResource: 'COLLECTIONS',
                parentInstance: ['users'],
                action: 'RO',
                actionToOthers: 'NONE',
                ownerInstance: ['mat1', '*']
            });
            assert.strictEqual(result.code, SYSTEM_STATUS.INVALID_SCHEMA);
        });

        it('should catch invalid ownerInstance object (missing name)', () => {
            const result = manager.validateRolElement('FIELD_METRICS', {
                parentResource: 'COLLECTIONS',
                parentInstance: ['users'],
                action: 'RO',
                actionToOthers: 'NONE',
                ownerInstance: [{ ttl: '1h' }] // missing name
            });
            assert.strictEqual(result.code, SYSTEM_STATUS.INVALID_SCHEMA);
        });

        it('should catch invalid EffectedAction in ownerInstance', () => {
            const result = manager.validateRolElement('FIELD_METRICS', {
                parentResource: 'COLLECTIONS',
                parentInstance: ['users'],
                action: 'RO',
                actionToOthers: 'NONE',
                ownerInstance: [{ name: 'mat1', EffectedAction: 'INVALID' }]
            });
            assert.strictEqual(result.code, SYSTEM_STATUS.INVALID_SCHEMA);
        });

        it('should catch invalid EffectedActionToOthers in ownerInstance', () => {
            const result = manager.validateRolElement('FIELD_METRICS', {
                parentResource: 'COLLECTIONS',
                parentInstance: ['users'],
                action: 'RO',
                actionToOthers: 'NONE',
                ownerInstance: [{ name: 'mat1', EffectedActionToOthers: 'INVALID' }]
            });
            assert.strictEqual(result.code, SYSTEM_STATUS.INVALID_SCHEMA);
        });

        it('should catch invalid TTL in ownerInstance', () => {
            const result = manager.validateRolElement('FIELD_METRICS', {
                parentResource: 'COLLECTIONS',
                parentInstance: ['users'],
                action: 'RO',
                actionToOthers: 'NONE',
                ownerInstance: [{ name: 'mat1', ttl: -500 }] // Negative TTL
            });
            assert.strictEqual(result.code, SYSTEM_STATUS.INVALID_SCHEMA);
        });

        it('should catch empty or invalid action notation', () => {
            let result = manager.validateRolElement('FIELD_METRICS', {
                parentResource: 'COLLECTIONS',
                parentInstance: ['users'],
                action: '',
                actionToOthers: 'NONE',
                ownerInstance: ['mat1']
            });
            assert.strictEqual(result.code, SYSTEM_STATUS.INVALID_SCHEMA);

            result = manager.validateRolElement('FIELD_METRICS', {
                parentResource: 'COLLECTIONS',
                parentInstance: ['users'],
                action: 'INVALID_ACTION',
                actionToOthers: 'NONE',
                ownerInstance: ['mat1']
            });
            assert.strictEqual(result.code, SYSTEM_STATUS.INVALID_SCHEMA);
        });

        it('should catch empty or invalid actionToOthers notation', () => {
            let result = manager.validateRolElement('FIELD_METRICS', {
                parentResource: 'COLLECTIONS',
                parentInstance: ['users'],
                action: 'RO',
                actionToOthers: '',
                ownerInstance: ['mat1']
            });
            assert.strictEqual(result.code, SYSTEM_STATUS.INVALID_SCHEMA);

            result = manager.validateRolElement('FIELD_METRICS', {
                parentResource: 'COLLECTIONS',
                parentInstance: ['users'],
                action: 'RO',
                actionToOthers: 'INVALID_ACTION',
                ownerInstance: ['mat1']
            });
            assert.strictEqual(result.code, SYSTEM_STATUS.INVALID_SCHEMA);
        });

        it('should catch invalid nested resource', () => {
            const result = manager.validateRolElement('FIELD_METRICS', {
                parentResource: 'COLLECTIONS',
                parentInstance: ['users'],
                action: 'RO',
                actionToOthers: 'NONE',
                ownerInstance: ['mat1'],
                nested: 'INVALID_NESTED',
                nestedInstance: ['sear1']
            });
            assert.strictEqual(result.code, SYSTEM_STATUS.INVALID_SCHEMA);
        });

        it('should catch invalid hierarchy: nested is not child of parent', () => {
            const result = manager.validateRolElement('FIELD_METRICS', {
                parentResource: 'COLLECTIONS',
                parentInstance: ['users'],
                action: 'RO',
                actionToOthers: 'NONE',
                ownerInstance: ['mat1'],
                nested: 'DOCUMENTS', // DOCUMENTS is not a child of COLLECTIONS that leads to FIELD_METRICS
                nestedInstance: ['doc1']
            });
            assert.strictEqual(result.code, SYSTEM_STATUS.INVALID_SCHEMA);
        });

        it('should catch invalid hierarchy: leaf is not child of nested', () => {
            const result = manager.validateRolElement('DOCUMENTS', { // DOCUMENTS is not child of SEARCH_INDEXES
                parentResource: 'COLLECTIONS',
                parentInstance: ['users'],
                action: 'RO',
                actionToOthers: 'NONE',
                ownerInstance: ['doc1'],
                nested: 'SEARCH_INDEXES',
                nestedInstance: ['sear1']
            });
            assert.strictEqual(result.code, SYSTEM_STATUS.INVALID_SCHEMA);
        });

        it('should catch invalid hierarchy: leaf is not child of parent (no nested)', () => {
            const result = manager.validateRolElement('FIELD_METRICS', {
                parentResource: 'DB', // FIELD_METRICS is not direct child of DB
                parentInstance: ['main'],
                action: 'RO',
                actionToOthers: 'NONE',
                ownerInstance: ['mat1'],
                nested: null,
                nestedInstance: null
            });
            assert.strictEqual(result.code, SYSTEM_STATUS.INVALID_SCHEMA);
        });

        it('should catch invalid global TTL', () => {
            const result = manager.validateRolElement('FIELD_METRICS', {
                parentResource: 'COLLECTIONS',
                parentInstance: ['users'],
                action: 'RO',
                actionToOthers: 'NONE',
                ownerInstance: ['mat1'],
                ttl: -999 // Invalid
            });
            assert.strictEqual(result.code, SYSTEM_STATUS.INVALID_SCHEMA);
        });
    });
});

console.log('✅ ResourceRoleGroupManager test suite loaded. Run with: node --test resourceRoleGroupManager.native.test.js');