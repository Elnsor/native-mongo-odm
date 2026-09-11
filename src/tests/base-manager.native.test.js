
import { test, describe, beforeEach, after, afterEach } from 'node:test';
import assert from 'node:assert';
import { ResourceRoleGroupManager } from '../rbac/compiler/base-manager.js';
import { resourceInstance } from '../rbac/buckets/systemReourcesInstances.js';
import { SYSTEM_STATUS } from '../rbac/constant/resourceType.js';

describe('ResourceRoleGroupManager', () => {
    let manager;

    beforeEach(() => {
      // dumy role 
        resourceInstance.reset();
        
        manager = new ResourceRoleGroupManager('TEST_MANAGER_ROLE', {
            'member_1': {
                'DOCUMENTS': {
                    parentResource: 'COLLECTIONS',
                    parentInstance: ['users'],
                    action: ['READ'],
                    boundary: 'OWN',
                    actionToOthers: 'NONE',
                    BoundaryToOthers: 'NONE',
                    ownerInstance: ['doc_1'],
                    nested: null,
                    nestedInstance: null,
                    ttl: null
                }
            }
        });
    });
    afterEach(()=>{
        resourceInstance.d
    })

    describe('validateRolElement', () => {
        test('should return 0 for valid role element', () => {
            const validElement = {
                parentResource: 'COLLECTIONS',
                parentInstance: ['users'],
                action: ['READ'],
                boundary: 'OWN',
                actionToOthers: 'NONE',
                BoundaryToOthers: 'NONE',
                ownerInstance: ['doc_1'],
                nested: null,
                nestedInstance: null
            };
            const result = manager.validateRolElement('DOCUMENTS', validElement);
            assert.strictEqual(result, 0);
        });

        test('should return error for invalid parent resource', () => {
            const invalidElement = {
                parentResource: 'INVALID_PARENT',
                parentInstance: ['users'],
                action: ['READ'],
                boundary: 'OWN',
                actionToOthers: 'NONE',
                BoundaryToOthers: 'NONE',
                ownerInstance: ['doc_1'],
                nested: null,
                nestedInstance: null
            };
            const result = manager.validateRolElement('DOCUMENTS', invalidElement);
            assert.strictEqual(result.code, SYSTEM_STATUS.INVALID_RESOURCE_PID);
        });

        test('should return error for empty parent instance list', () => {
            const invalidElement = {
                parentResource: 'COLLECTIONS',
                parentInstance: [],
                action: ['READ'],
                boundary: 'OWN',
                actionToOthers: 'NONE',
                BoundaryToOthers: 'NONE',
                ownerInstance: ['doc_1'],
                nested: null,
                nestedInstance: null
            };
            const result = manager.validateRolElement('DOCUMENTS', invalidElement);
            assert.strictEqual(result.code, SYSTEM_STATUS.RESOURCES_EMPTY_LIST);
        });

        test('should return error if wildcard is mixed with other instances', () => {
            const invalidElement = {
                parentResource: 'COLLECTIONS',
                parentInstance: ['*', 'users'], // خطأ: لا يمكن خلط * مع عناصر أخرى
                action: ['READ'],
                boundary: 'OWN',
                actionToOthers: 'NONE',
                BoundaryToOthers: 'NONE',
                ownerInstance: ['doc_1'],
                nested: null,
                nestedInstance: null
            };
            const result = manager.validateRolElement('DOCUMENTS', invalidElement);
            assert.strictEqual(result.code, SYSTEM_STATUS.WILDCARD_WITHE_INSTANCE);
        });
    });
});