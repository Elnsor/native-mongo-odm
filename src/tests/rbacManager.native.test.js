
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { RBACManager } from '../rbac/rbacManager.js';
import { resourceInstance } from '../rbac/buckets/systemReourcesInstances.js';
import { RoleBaseBuckets } from '../rbac/buckets/buckets.js';
import { TYPE_IDS, SYSTEM_STATUS, DEFAULT_ACTIONS, BOUNDARY } from '../rbac/constant/resourceType.js';
import { EVENT_TYPES ,EVENT_MTYPES  } from '../Monitor/constant/eventType.js';
import { METRIC_NAMES } from '../Monitor/constant/metricsName.js';
import { MonitoringSystem, getMonitoring } from '../Monitor/monitoringSystem.js';

describe('RBACManager - Full Integration Tests (No Mocks)', () => {
    let rbacManager;

    beforeEach(() => {
       
        resourceInstance.reset();
        RoleBaseBuckets.bucket.clear();
        RoleBaseBuckets.insBucket.clear();
        RoleBaseBuckets.expiredBucket.clear();
        RoleBaseBuckets.instanceToRoles.clear();
        
      
        if (MonitoringSystem.resetInstance) {
            MonitoringSystem.resetInstance();
        }

       
        rbacManager = new RBACManager();
    });

    // ==========================================================================
    // 1. Initialization Tests
    // ==========================================================================
    describe('Initialization', () => {
        test('should initialize successfully and enable monitoring', () => {
            const result = rbacManager.initialize({ monitoring: { enabled: true } });
            
            assert.strictEqual(result, rbacManager, 'Should return this for chaining');
            const monitoring = getMonitoring();
            assert.strictEqual(monitoring.isEnabled, true, 'Monitoring should be enabled');
        });

        test('should warn and return early if already initialized', () => {
            rbacManager.initialize({ monitoring: { enabled: true } });
            
            
            let warnCalled = false;
            const originalWarn = console.warn;
            console.warn = () => { warnCalled = true; };
            
            const result = rbacManager.initialize();
            
            console.warn = originalWarn;
            assert.strictEqual(warnCalled, true, 'Should warn about being already initialized');
            assert.strictEqual(result, rbacManager);
        });
    });

    // ==========================================================================
    // 2. Resource Registration Tests
    // ==========================================================================
    describe('Resource Registration', () => {
        test('should successfully register resource instances', () => {
            const result = rbacManager.registerResource('COLLECTIONS', ['users_collection', 'products_collection']);
            assert.strictEqual(result, true);
            
            const index1 = rbacManager.getregisterResource('COLLECTIONS', 'users_collection');
            const index2 = rbacManager.getregisterResource('COLLECTIONS', 'products_collection');
            
            assert.strictEqual(typeof index1, 'number');
            assert.strictEqual(typeof index2, 'number');
            assert.notStrictEqual(index1, index2);
        });

        test('should return false if resource name is invalid', () => {
            let errorLogged = false;
            const originalError = console.error;
            console.error = () => { errorLogged = true; };
            
            const result = rbacManager.registerResource('INVALID_RESOURCE', ['inst_1']);
            
            console.error = originalError;
            assert.strictEqual(result, false);
            assert.strictEqual(errorLogged, true);
        });

        test('should return false when getting non-existent instance', () => {
            let errorLogged = false;
            const originalError = console.error;
            console.error = () => { errorLogged = true; };
            
            const result = rbacManager.getregisterResource('COLLECTIONS', 'non_existent');
            
            console.error = originalError;
            assert.strictEqual(result, false);
            assert.strictEqual(errorLogged, true);
        });
    });

    // ==========================================================================
    // 3. Role Lifecycle Tests (Create, Update, Delete)
    // ==========================================================================
    describe('Role Lifecycle', () => {
        const ROLE_NAME = 'TEST_MANAGER_ROLE';
        let validRoleDefinition;

        beforeEach(() => {
            rbacManager.registerResource('COLLECTIONS', ['users_collection']);
            rbacManager.registerResource('SEARCH_INDEXES', ['idx_1', 'idx_2']);
            rbacManager.registerResource('FIELD_METRICS', ['mat1' ]);
            
            validRoleDefinition = {
                'member_1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: ['READ', 'WRITE'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['mat1'],
                        nested: "SEARCH_INDEXES",
                        nestedInstance: ["idx_1"],
                        ttl: null
                    }
                }
            };
        });

        test('should successfully create a role', () => {
            const result = rbacManager.createRole(ROLE_NAME, validRoleDefinition);
            
            assert.strictEqual(result.success, true);
            assert.strictEqual(result.message, 'Role created successfully');
            assert.strictEqual(typeof result.roleId, 'number');
            
            // Verify it's in the bucket
            assert.ok(RoleBaseBuckets.insBucket.has(result.roleId));
        });

        test('should fail to create role with invalid definition', () => {
            const invalidDefinition = {
                'member_1': {
                    'SEARCH_INDEXES': {
                        parentResource: 'INVALID_PARENT', // خطأ متعمد
                        parentInstance: ['users_collection'],
                        action: ['READ'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['idx_1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };
            
            const result = rbacManager.createRole('INVALID_ROLE', invalidDefinition);
            
            assert.strictEqual(result.success, false);
            assert.strictEqual(result.code, SYSTEM_STATUS.INVALID_RESOURCE_PID);
        });

        test('should fail to create duplicate role', () => {
            rbacManager.createRole(ROLE_NAME, validRoleDefinition);
            const result = rbacManager.createRole(ROLE_NAME, validRoleDefinition);
            
            assert.strictEqual(result.success, false);
            assert.strictEqual(result.code, SYSTEM_STATUS.ROLE_CREAT_ERROR);
        });

        test('should successfully update (hot-swap) an existing role', () => {
            rbacManager.createRole(ROLE_NAME, validRoleDefinition);
            
            const updatedDefinition = {
                'member_1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: ['READ', 'WRITE', 'UPDATE'], // add 
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['mat1'],
                        nested: "SEARCH_INDEXES",
                        nestedInstance: ['idx_1','idx_2'], //add 
                        ttl: null
                    }
                }
            };
            
            const result = rbacManager.updateRole(ROLE_NAME, updatedDefinition);
           
            
            assert.strictEqual(result.success, true);
            assert.ok(result.message.includes('is updated'));
        });

        test('should fail to update non-existent role', () => {
            const result = rbacManager.updateRole('NON_EXISTENT_ROLE', validRoleDefinition);
            assert.strictEqual(result.success, false);
            assert.strictEqual(result.code, SYSTEM_STATUS.ROLE_NOT_FOUND);
        });

        test('should successfully delete a role', () => {
            rbacManager.createRole(ROLE_NAME, validRoleDefinition);
            const roleId = resourceInstance.getRoleId(ROLE_NAME);
            
            const result = rbacManager.deleteRole(ROLE_NAME);
            
            assert.strictEqual(result.success, true);
            assert.strictEqual(result.message, 'GRole deleted successfully');
            assert.ok(!RoleBaseBuckets.insBucket.has(roleId));
        });

        test('should fail to delete non-existent role', () => {
            const result = rbacManager.deleteRole('NON_EXISTENT_ROLE');
            assert.strictEqual(result.success, false);
            assert.strictEqual(result.message, 'Role not found');
        });
    });

    // ==========================================================================
    // 4. Access Control Tests
    // ==========================================================================
    describe('Access Control', () => {
        const ROLE_NAME = 'ACCESS_TEST_ROLE';
        let roleId;

        beforeEach(() => {
            rbacManager.registerResource('COLLECTIONS', ['users_collection']);
            rbacManager.registerResource('SEARCH_INDEXES', ['idx_1']);
            
            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: ['READ'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['idx_1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };
            
            rbacManager.createRole(ROLE_NAME, roleDefinition);
            roleId = resourceInstance.getRoleId(ROLE_NAME);
        });

        test('checkAccess should work when NOT initialized (no monitoring)', () => {
            
            const pType = TYPE_IDS.COLLECTIONS;
            const pInstId = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            const cType = TYPE_IDS.DOCUMENTS;
            const cInsId = resourceInstance.getResourceInstanceIndex('DOCUMENTS', 'idx_1');
            
            const access = rbacManager.checkAccess(roleId, pType, pInstId, cType, cInsId);
            
            assert.ok(typeof access === 'number', 'Should return numeric access effects');
            assert.strictEqual(rbacManager.AllowedPrimaryTarget(access, DEFAULT_ACTIONS.READ), true);
        });

        test('checkAccess should work when initialized (with monitoring)', async() => {
            rbacManager.initialize({ monitoring: { enabled: true } });
            /**
             * @type {MonitoringSystem}
             */

            let monitor=getMonitoring();

        
            monitor.registerHandler(EVENT_TYPES.RBAC_AUTH_CHECK, EVENT_MTYPES.METRIC_C, (data, collector) => {
                    
              
                    collector.increment(METRIC_NAMES.RBAC_CHECK_TOTAL);
                  
                });
                monitor.registerHandler(EVENT_TYPES.RBAC_AUTH_CHECK,EVENT_MTYPES.METRIC_H, (data, collector) => {
                 
                    collector.observeHistogram(METRIC_NAMES.RBAC_CHECK_DURATION, data.v1,{},"ns");
                });
            
            const pType = TYPE_IDS.COLLECTIONS;
            const pInstId = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            const cType = TYPE_IDS.DOCUMENTS;
            const cInsId = resourceInstance.getResourceInstanceIndex('DOCUMENTS', 'idx_1');
            
            const access = rbacManager.checkAccess(roleId, pType, pInstId, cType, cInsId);
            
            assert.ok(typeof access === 'number');
            
            
           
            const snapshot = (await monitor.getSyncMetricsSnapshot()).metrics // monitor.collector.snapshot();
            const histogramKeys = Object.keys(snapshot.histograms);
            
            assert.ok(histogramKeys.some(k => k.includes('rbac.access.check.duration')), 'Should record duration histogram');
        });

        test('checkAccess should deny access for non-existent role', () => {
            const pType = TYPE_IDS.COLLECTIONS;
            const pInstId = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            const cType = TYPE_IDS.DOCUMENTS;
            const cInsId = resourceInstance.getResourceInstanceIndex('DOCUMENTS', 'idx_1');
            
            const access = rbacManager.checkAccess(99999, pType, pInstId, cType, cInsId);
            
            assert.strictEqual(access.code, SYSTEM_STATUS.ACCESS_DENIED);
        });
    });

    // ==========================================================================
    // 5. Decoding & Bitwise Tests
    // ==========================================================================
    describe('Decoding & Bitwise Operations', () => {
        test('decodeActionEffects should correctly decode actions', () => {
            const effects = DEFAULT_ACTIONS.READ | DEFAULT_ACTIONS.WRITE; // 1 | 2 = 3
            const permissions = rbacManager.decodeActionEffects(effects);
            
            assert.ok(permissions.includes('read'));
            assert.ok(permissions.includes('write'));
            assert.strictEqual(permissions.length, 2);
        });

        test('decodeBoundaryEffects should correctly decode boundaries', () => {
            const effects = BOUNDARY.OWN | BOUNDARY.ALL; // 16 | 64 = 80
            const permissions = rbacManager.decodeBoundaryEffects(effects);
            
            assert.ok(permissions.includes('OWN'));
            assert.ok(permissions.includes('ALL'));
            assert.strictEqual(permissions.length, 2);
        });

        test('AllowedPrimaryTarget should delegate correctly', () => {
            const effects = DEFAULT_ACTIONS.READ | DEFAULT_ACTIONS.UPDATE; // 1 | 4 = 5
            assert.strictEqual(rbacManager.AllowedPrimaryTarget(effects, DEFAULT_ACTIONS.READ), true);
            assert.strictEqual(rbacManager.AllowedPrimaryTarget(effects, DEFAULT_ACTIONS.WRITE), false);
        });

        test('AllowedTargetToOthers should delegate correctly', () => {
            // Others actions are in the upper 16 bits
            const othersEffects = DEFAULT_ACTIONS.READ << 16; 
            assert.strictEqual(rbacManager.AllowedTargetToOthers(othersEffects, DEFAULT_ACTIONS.READ), true);
            assert.strictEqual(rbacManager.AllowedTargetToOthers(othersEffects, DEFAULT_ACTIONS.WRITE), false);
        });
    });

    // ==========================================================================
    // 6. Instance Management Tests
    // ==========================================================================
    describe('Instance Management', () => {
        beforeEach(() => {
            rbacManager.registerResource('COLLECTIONS', ['users_collection', 'products_collection']);
        });

        test('deleteInstance should fail for invalid resource name', () => {
            const result = rbacManager.deleteInstance('INVALID_RESOURCE', 'inst_1');
            
            assert.strictEqual(result.success, false);
            assert.strictEqual(result.code, SYSTEM_STATUS.INVALID_RESOURCE_PID);
        });

        test('deleteInstance should fail for non-existent instance', () => {
            const result = rbacManager.deleteInstance('COLLECTIONS', 'non_existent_collection');
            
            assert.strictEqual(result.success, false);
            assert.strictEqual(result.code, SYSTEM_STATUS.RESOURCE_NOT_FOUND);
        });

        test('deleteInstance should succeed for unused instance', () => {

            const result = rbacManager.deleteInstance('COLLECTIONS', 'products_collection');
            
            assert.strictEqual(result.success, true);
            assert.strictEqual(result.message, 'Instance deleted successfully');
        });
    });

    // ==========================================================================
    // 7. System Info Tests
    // ==========================================================================
    describe('System Info', () => {
        test('getSystemInfo should return correct statistics', () => {
            rbacManager.registerResource('COLLECTIONS', ['users_collection']);
            rbacManager.registerResource('SEARCH_INDEXES', ['idx_1']);
            
            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: ['READ'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['idx_1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };
            
            rbacManager.createRole('INFO_ROLE_1', roleDefinition);
            rbacManager.createRole('INFO_ROLE_2', roleDefinition);
            
            const info = rbacManager.getSystemInfo();
            
            assert.strictEqual(info.totalRoles, 2);
            assert.strictEqual(info.activeRoles.length, 2);
            assert.ok(info.activeRoles[0].hasOwnProperty('roleId'));
            assert.ok(info.activeRoles[0].hasOwnProperty('roleName'));
            assert.ok(info.activeRoles[0].hasOwnProperty('bufferSize'));
        });
    });
});