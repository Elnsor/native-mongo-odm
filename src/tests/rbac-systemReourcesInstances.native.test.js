import { test, describe, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import { resourceInstance } from '../rbac/buckets/systemReourcesInstances.js';
import { 
    SYSTEM_STATUS, 
    TYPE_IDS, 
    RESOURCE_NONE_INSTANCES, 
    STRIDER_SIZES, 
    SIZE_POWER 
} from '../rbac/constant/resourceType.js';
import { RoleBaseBuckets } from '../rbac/buckets/buckets.js';

describe('SystemResourcesIntstances', () => {
    beforeEach(() => {
        // Reset singleton state before each test
        resourceInstance.reset();
        // Ensure wildcard power is reset to default
        SIZE_POWER.WILDCARD = 32;
    });

    describe('Role Management', () => {
        test('should add a new role successfully', () => {
            const result = resourceInstance.AddRole('TEST_ADMIN_ROLE');
            assert.strictEqual(result, true);
            
            const roleId = resourceInstance.getRoleId('TEST_ADMIN_ROLE');
            assert.strictEqual(typeof roleId, 'number');
            assert.ok(roleId >= 1);
        });

        test('should return error if role already exists', () => {
            resourceInstance.AddRole('DUPLICATE_ROLE');
            const result = resourceInstance.AddRole('DUPLICATE_ROLE');
            assert.strictEqual(result.code, SYSTEM_STATUS.ROLE_EXISTS);
        });

        test('should get role name by ID successfully (Reverse Lookup)', () => {
            resourceInstance.AddRole('TEST_GET_NAME_ROLE');
            const roleId = resourceInstance.getRoleId('TEST_GET_NAME_ROLE');
            const name = resourceInstance.getRoleNameById(roleId);
            assert.strictEqual(name, 'TEST_GET_NAME_ROLE');
        });

        test('should return error for non-existent role ID', () => {
            const result = resourceInstance.getRoleNameById(9999);
            assert.strictEqual(result.code, SYSTEM_STATUS.ROLE_NOT_FOUND);
        });

        test('should return error for non-existent role name', () => {
            const result = resourceInstance.getRoleId('NON_EXISTENT_ROLE');
            assert.strictEqual(result.code, SYSTEM_STATUS.ROLE_NOT_FOUND);
        });

        test('should delete role successfully if not active', () => {
            resourceInstance.AddRole('TO_DELETE_ROLE');
            
            // Mock isRoleActiveByName to return false
            const mockIsActive = mock.method(RoleBaseBuckets, 'isRoleActiveByName', () => false);
            
            const result = resourceInstance.deleteRolebyName('TO_DELETE_ROLE');
            assert.strictEqual(result, true);
            
            const roleId = resourceInstance.getRoleId('TO_DELETE_ROLE');
            assert.strictEqual(roleId.code, SYSTEM_STATUS.ROLE_NOT_FOUND);
            
            mockIsActive.mock.restore();
        });

        test('should return error when deleting an active role', () => {
            resourceInstance.AddRole('ACTIVE_ROLE');
            
            // Mock isRoleActiveByName to return true
            const mockIsActive = mock.method(RoleBaseBuckets, 'isRoleActiveByName', () => true);
            
            const result = resourceInstance.deleteRolebyName('ACTIVE_ROLE');
            assert.strictEqual(result.code, SYSTEM_STATUS.DELETE_ERROR);
            
            mockIsActive.mock.restore();
        });
    });

    describe('Resource Instance Management', () => {
        test('should add a resource instance successfully', () => {
            const result = resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            assert.strictEqual(result, true);
        });

        test('should return error for invalid resource PID', () => {
            const result = resourceInstance.AddResourceInstance('INVALID_RESOURCE', 'inst_1');
            assert.strictEqual(result.code, SYSTEM_STATUS.INVALID_RESOURCE_PID);
        });

        test('should return error if resource is not allowed to have instances', () => {
            // DOCUMENTS is defined in RESOURCE_NONE_INSTANCES
            const result = resourceInstance.AddResourceInstance('DOCUMENTS', 'doc_1');
            assert.strictEqual(result.code, SYSTEM_STATUS.INSTANCE_NOT_ALLOWED);
        });

        test('should return error if instance already exists', () => {
            resourceInstance.AddResourceInstance('COLLECTIONS', 'prod_1');
            const result = resourceInstance.AddResourceInstance('COLLECTIONS', 'prod_1');
            assert.strictEqual(result.code, SYSTEM_STATUS.INSTANCE_EXIST);
        });

        test('should get resource instance index by name', () => {
            resourceInstance.AddResourceInstance('COLLECTIONS', 'team_alpha');
            const index = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'team_alpha');
            assert.strictEqual(typeof index, 'number');
            assert.ok(index >= 0);
        });

        test('should return wildcard index for "*" instance', () => {
            const index = resourceInstance.getResourceInstanceIndex('COLLECTIONS', '*');
            assert.strictEqual(index, STRIDER_SIZES.WILDCARD_INDEX);
        });

        test('should return 0 for resources that cannot have instances', () => {
            const index = resourceInstance.getResourceInstanceIndex('DOCUMENTS', 'any_instance');
            assert.strictEqual(index, 0);
        });

        test('should return error for non-existent resource instance index', () => {
            const result = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'non_existent');
            assert.strictEqual(result.code, SYSTEM_STATUS.RESOURCE_NOT_FOUND);
        });

        test('should get resource instance list', () => {
            resourceInstance.AddResourceInstance('COLLECTIONS', 'inst_1');
            resourceInstance.AddResourceInstance('COLLECTIONS', 'inst_2');
            const list = resourceInstance.getResourceInstanceList('COLLECTIONS');
            const expected = Object.create(null);
                  expected.inst_1 = 0;
                  expected.inst_2 = 1;
            assert.deepStrictEqual(list, expected);
        });

        test('should return error for non-existent resource in instance list', () => {
            const result = resourceInstance.getResourceInstanceList('NON_EXISTENT_RESOURCE');
            assert.strictEqual(result.code, SYSTEM_STATUS.INVALID_RESOURCE_PID);
        });
    });

    describe('Resource Instance Deletion', () => {
        test('should delete resource instance successfully if not active', () => {
            resourceInstance.AddResourceInstance('COLLECTIONS', 'to_delete');
            
            // Mock isParentReourceInstanceActive to return false
            const mockIsActive = mock.method(RoleBaseBuckets, 'isParentReourceInstanceActive', () => false);
            
            const result = resourceInstance.deletetResourceInstanceIndex('COLLECTIONS', 'to_delete');
            assert.strictEqual(result, true);
            
            const index = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'to_delete');
           
            assert.strictEqual(index.code, SYSTEM_STATUS.RESOURCE_NOT_FOUND);
            
            mockIsActive.mock.restore();
        });

        test('should return error when deleting an instance linked to an active role', () => {
            resourceInstance.AddResourceInstance('COLLECTIONS', 'active_inst');
            
            // Mock isParentReourceInstanceActive to return true
            const mockIsActive = mock.method(RoleBaseBuckets, 'isParentReourceInstanceActive', () => true);
            
            const result = resourceInstance.deletetResourceInstanceIndex('COLLECTIONS', 'active_inst');
            assert.strictEqual(result.success, false);
            assert.strictEqual(result.code, SYSTEM_STATUS.DELETE_ERROR);
            
            mockIsActive.mock.restore();
        });

        test('should return error when deleting non-existent instance', () => {
            const result = resourceInstance.deletetResourceInstanceIndex('COLLECTIONS', 'non_existent');
            assert.strictEqual(result.success, false);
            assert.strictEqual(result.code, SYSTEM_STATUS.RESOURCE_NOT_FOUND);
        });
    });

    describe('Reset Functionality', () => {
        test('should reset all state', () => {
            // Add some data
            resourceInstance.AddRole('ROLE_1');
            resourceInstance.AddRole('ROLE_2');
            resourceInstance.AddResourceInstance('COLLECTIONS', 'inst_1');
            
            // Verify data exists
            assert.ok(resourceInstance.getRoleId('ROLE_1'));
            
            // Reset
            resourceInstance.reset();
            
            // Verify everything is cleared
            const roleId = resourceInstance.getRoleId('ROLE_1');
            assert.strictEqual(roleId.code, SYSTEM_STATUS.ROLE_NOT_FOUND);
            
            const stats = resourceInstance.getStats();
            assert.strictEqual(stats.rolesCount, 0);
            assert.strictEqual(stats.resourcesCount, 0);
            assert.strictEqual(stats.resourcesDeleteCount, 0);
        });

        test('should allow re-adding same role after reset', () => {
            resourceInstance.AddRole('REUSE_ROLE');
            resourceInstance.reset();
            
            const result = resourceInstance.AddRole('REUSE_ROLE');
            assert.strictEqual(result, true);
        });
    });

    describe('Stats & Metrics', () => {
        test('should return correct statistics', () => {
            resourceInstance.AddRole('ROLE_A');
            resourceInstance.AddRole('ROLE_B');
            resourceInstance.AddResourceInstance('COLLECTIONS', 'inst_1');
            resourceInstance.AddResourceInstance('COLLECTIONS', 'inst_2');
            
            // Mock to allow deletion for stats testing
            const mockIsActive = mock.method(RoleBaseBuckets, 'isParentReourceInstanceActive', () => false);
            resourceInstance.deletetResourceInstanceIndex('COLLECTIONS', 'inst_1');
            mockIsActive.mock.restore();

            const stats = resourceInstance.getStats();
            
            assert.strictEqual(stats.rolesCount, 2);
            assert.strictEqual(stats.resourcesCount, 1); // 2 added, 1 deleted
            assert.strictEqual(stats.resourcesDeleteCount, 1);
        });
    });
});

console.log('✅ SystemResourcesIntstances native test suite loaded. Run with: node --test systemReourcesInstances.native.test.js');