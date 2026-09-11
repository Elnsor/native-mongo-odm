    
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { resourceInstance } from '../rbac/buckets/systemReourcesInstances.js';
import { SYSTEM_STATUS } from '../rbac/constant/resourceType.js';

describe('SystemResourcesIntstances', () => {
   
    beforeEach(() => {
        resourceInstance.reset();
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

        test('should add a role member successfully', () => {
            resourceInstance.AddRole('TEST_ROLE_WITH_MEMBERS');
            const result = resourceInstance.AddRoleMember('TEST_ROLE_WITH_MEMBERS', 'member_1');
            assert.strictEqual(result, true);
        });

        test('should return error if role member already exists', () => {
            resourceInstance.AddRole('TEST_ROLE_DUP_MEMBER');
            resourceInstance.AddRoleMember('TEST_ROLE_DUP_MEMBER', 'member_1');
            const result = resourceInstance.AddRoleMember('TEST_ROLE_DUP_MEMBER', 'member_1');
            assert.strictEqual(result.code, SYSTEM_STATUS.ROLE_MEMBER_EXISTS);
        });

        test('should get role member name by index', () => {
            resourceInstance.AddRole('TEST_GET_MEMBER');
            resourceInstance.AddRoleMember('TEST_GET_MEMBER', 'john_doe');
            
            const roleId = resourceInstance.getRoleId('TEST_GET_MEMBER');
            const memberIndex = resourceInstance.getRoleMemberIndexByName(roleId, 'john_doe');
            
            const name = resourceInstance.getRoleMemberNameByIndexed(roleId, memberIndex);
            assert.strictEqual(name, 'john_doe');
        });

        test('should return error for non-existent role', () => {
            const result = resourceInstance.getRoleId('NON_EXISTENT_ROLE');
            assert.strictEqual(result.code, SYSTEM_STATUS.ROLE_NOT_FOUND);
        });
    });

    describe('Resource Instance Management', () => {
        test('should add a resource instance successfully', () => {
            const result = resourceInstance.AddResourceInstance('USERS', 'user_instance_1');
            assert.strictEqual(result, true);
        });

        test('should return error for invalid resource PID', () => {
            const result = resourceInstance.AddResourceInstance('INVALID_RESOURCE', 'inst_1');
            assert.strictEqual(result.code, SYSTEM_STATUS.INVALID_RESOURCE_PID);
        });

        test('should return error if instance already exists', () => {
            resourceInstance.AddResourceInstance('PRODUCTS', 'prod_1');
            const result = resourceInstance.AddResourceInstance('PRODUCTS', 'prod_1');
            assert.strictEqual(result.code, SYSTEM_STATUS.INSTANCE_EXIST);
        });

        test('should get resource instance index by name', () => {
            resourceInstance.AddResourceInstance('TEAMS', 'team_alpha');
            const index = resourceInstance.getResourceInstanceIndex('TEAMS', 'team_alpha');
            assert.strictEqual(typeof index, 'number');
            assert.ok(index >= 0);
        });

        test('should return wildcard index for "*" instance', () => {
            const index = resourceInstance.getResourceInstanceIndex('USERS', '*');
            assert.strictEqual(typeof index, 'number');
            assert.ok(index > 0);
        });

        test('should delete resource instance', () => {
            resourceInstance.AddResourceInstance('USERS', 'to_delete');
            const result = resourceInstance.deletetResourceInstanceIndex('USERS', 'to_delete');
            assert.strictEqual(result, true);
            
            const index = resourceInstance.getResourceInstanceIndex('USERS', 'to_delete');
            assert.strictEqual(index.code, SYSTEM_STATUS.RESOURCE_NOT_FOUND);
        });
    });

    describe('Reset Functionality', () => {
        test('should reset all state', () => {
            // Add some data
            resourceInstance.AddRole('ROLE_1');
            resourceInstance.AddRole('ROLE_2');
            resourceInstance.AddResourceInstance('USERS', 'inst_1');
            
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
        });

        test('should allow re-adding same role after reset', () => {
            resourceInstance.AddRole('REUSE_ROLE');
            resourceInstance.reset();
            
            const result = resourceInstance.AddRole('REUSE_ROLE');
            assert.strictEqual(result, true);
        });
    });

    describe('Stats', () => {
        test('should return correct statistics', () => {
            resourceInstance.AddRole('ROLE_A');
            resourceInstance.AddRole('ROLE_B');
            resourceInstance.AddRoleMember('ROLE_A', 'member_1');
            resourceInstance.AddResourceInstance('USERS', 'inst_1');
            
            const stats = resourceInstance.getStats();
            
            assert.strictEqual(stats.rolesCount, 2);
            assert.strictEqual(stats.roleMembersCount, 1);
            assert.strictEqual(stats.resourcesCount, 1);
        });
    });
});