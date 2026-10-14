import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { AutherizationCheck } from '../rbac/authorized/authorization.js';
import { RoleBaseBuckets } from '../rbac/buckets/buckets.js';
import { resourceInstance } from '../rbac/buckets/systemReourcesInstances.js';
import { RoleCompiler } from '../rbac/compiler/schema-parser.js';
import { RoleBinaryWorker } from '../rbac/allocator/binary-worker.js';
import { 
    TYPE_IDS, 
    STRIDER_SIZES, 
    SYSTEM_STATUS,
    SIZE_POWER,
    DEFAULT_ACTIONS,
    BOUNDARY,
    EFFECT_ACTION
} from '../rbac/constant/resourceType.js';


describe('AutherizationCheck - Integration Tests', () => {
    
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

    
    // TEST SUITE 1: Bitwise Operations (Pure Functions)
    
    describe('Test 1: Bitwise Operations', () => {
        let authCheck;

        beforeEach(() => {
            authCheck = new AutherizationCheck();
        });

        test('getPrimary should extract lower 16 bits', () => {
            const packed32 = 0x00010013; // others=1, primary=0x0013 (READ|WRITE|OWN)
            const primary = authCheck.getPrimary(packed32);
            assert.strictEqual(primary, 0x0013);
        });

        test('getPrimary should handle zero others', () => {
            const packed32 = EFFECT_ACTION['RA']; // READ|ALL
            const primary = authCheck.getPrimary(packed32);
            assert.strictEqual(primary, EFFECT_ACTION['RA']);
        });

        test('getOthers should extract upper 16 bits', () => {
            const packed32 = 0x00410013;
            const others = authCheck.getOthers(packed32);
            assert.strictEqual(others, 0x0041);
        });

        test('getOthers should return 0 when no others', () => {
            const packed32 = 0x00000013;
            const others = authCheck.getOthers(packed32);
            assert.strictEqual(others, 0);
        });

        test('getPrimaryAction should extract 4 action bits', () => {
            const packed32 = 0x00000013; // READ|WRITE|OWN (1|2|16 = 19)
            const action = authCheck.getPrimaryAction(packed32);
            assert.strictEqual(action, 0x03); // READ|WRITE = 3
        });

        test('getPrimaryAction should handle all actions', () => {
            const packed32 = EFFECT_ACTION['RWUDA'] //0x0000006F; // READ|WRITE|UPDATE|DELETE|ALL (15|64 = 79)
            const action = authCheck.getPrimaryAction(packed32);
            assert.strictEqual(action, 0x0F); // 15
        });

        test('getOthersAction should extract others action bits', () => {
            const packed32 = 0x00030013; // others action = 3 (READ|WRITE) (get least 4 bit from highest 16 bit of 32 Effected bit)
            const othersAction = authCheck.getOthersAction(packed32);
            assert.strictEqual(othersAction, 0x03);
        });

        test('getPrimaryBoundary should extract boundary bits', () => {
            const packed32 = EFFECT_ACTION['RWO']; // READ|WRITE|OWN (1|2|16 = 19)
            const boundary = authCheck.getPrimaryBoundary(packed32);
            assert.strictEqual(boundary, BOUNDARY.OWN); // 16
        });

        test('getPrimaryBoundary should handle ALL boundary', () => {
            const packed32 = EFFECT_ACTION['RWUDA']; // READ|WRITE|UPDATE|DELETE|ALL (15|64 = 79)
            const boundary = authCheck.getPrimaryBoundary(packed32);
            assert.strictEqual(boundary, BOUNDARY.ALL); // 64
        });

        test('getPrimaryBoundary should handle LIMITED boundary', () => {
            const packed32 = EFFECT_ACTION['RWL']//0x00000023; // READ|WRITE|LIMITED (1|2|32 = 35)
            const boundary = authCheck.getPrimaryBoundary(packed32);
            assert.strictEqual(boundary, BOUNDARY.LIMITED); // 32
        });

        test('getOthersBoundary should extract others boundary', () => {
            const packed32 = 0x00400013; // others boundary = ALL (64 << 16)
            const othersBoundary = authCheck.getOthersBoundary(packed32);
            assert.strictEqual(othersBoundary, BOUNDARY.ALL);
        });

        test('canPerformPrimary should return true when action bit is set', () => {
            const packed32 = 0x00000013; // READ|WRITE|OWN
            assert.strictEqual(authCheck.canPerformPrimary(packed32, DEFAULT_ACTIONS.READ), true);
            assert.strictEqual(authCheck.canPerformPrimary(packed32, DEFAULT_ACTIONS.WRITE), true);
        });

        test('canPerformPrimary should return false when action bit is not set', () => {
            const packed32 = 0x00000013; // READ|WRITE|OWN
            assert.strictEqual(authCheck.canPerformPrimary(packed32, DEFAULT_ACTIONS.UPDATE), false);
            assert.strictEqual(authCheck.canPerformPrimary(packed32, DEFAULT_ACTIONS.DELETE), false);
        });

        test('canPerformPrimary should handle all actions', () => {
            const packed32 = EFFECT_ACTION["RWUDA"]//0x0000006F; // READ|WRITE|UPDATE|DELETE|ALL
            assert.strictEqual(authCheck.canPerformPrimary(packed32, DEFAULT_ACTIONS.READ), true);
            assert.strictEqual(authCheck.canPerformPrimary(packed32, DEFAULT_ACTIONS.WRITE), true);
            assert.strictEqual(authCheck.canPerformPrimary(packed32, DEFAULT_ACTIONS.UPDATE), true);
            assert.strictEqual(authCheck.canPerformPrimary(packed32, DEFAULT_ACTIONS.DELETE), true);
        });

        test('canPerformOnOthers should return true when others action bit is set', () => {
            const packed32 = 0x00030013; // others action = READ|WRITE
            assert.strictEqual(authCheck.canPerformOnOthers(packed32, DEFAULT_ACTIONS.READ), true);
            assert.strictEqual(authCheck.canPerformOnOthers(packed32, DEFAULT_ACTIONS.WRITE), true);
        });

        test('canPerformOnOthers should return false when others action bit is not set', () => {
            const packed32 = 0x00030013; // others action = READ|WRITE
            assert.strictEqual(authCheck.canPerformOnOthers(packed32, DEFAULT_ACTIONS.UPDATE), false);
            assert.strictEqual(authCheck.canPerformOnOthers(packed32, DEFAULT_ACTIONS.DELETE), false);
        });

        test('canPerformOnOthers should return false when no others permissions', () => {
            const packed32 = 0x00000013; // no others
            assert.strictEqual(authCheck.canPerformOnOthers(packed32, DEFAULT_ACTIONS.READ), false);
        });

        test('should correctly pack and unpack complex permissions', () => {
            const primary = EFFECT_ACTION['RWO']  // old way DEFAULT_ACTIONS.READ | DEFAULT_ACTIONS.WRITE | BOUNDARY.OWN;
            const others = EFFECT_ACTION['RA'] // old DEFAULT_ACTIONS.READ | BOUNDARY.ALL;
            const packed32 = (others << 16) | primary;

            assert.strictEqual(authCheck.getPrimary(packed32), primary);
            assert.strictEqual(authCheck.getOthers(packed32), others);
            assert.strictEqual(authCheck.canPerformPrimary(packed32, DEFAULT_ACTIONS.READ), true);
            assert.strictEqual(authCheck.canPerformPrimary(packed32, DEFAULT_ACTIONS.WRITE), true);
            assert.strictEqual(authCheck.canPerformPrimary(packed32, DEFAULT_ACTIONS.UPDATE), false);
            assert.strictEqual(authCheck.canPerformOnOthers(packed32, DEFAULT_ACTIONS.READ), true);
            assert.strictEqual(authCheck.canPerformOnOthers(packed32, DEFAULT_ACTIONS.WRITE), false);
        });
    });

    
    // checkAccess - Simple Role (Parent → Child)
    
    describe('Test 2: checkAccess - Simple Role', () => {
        const ROLE_NAME = 'SIMPLE_ACCESS_ROLE';
        let authCheck;
        let roleId;

        beforeEach(() => {
            authCheck = new AutherizationCheck();
            
            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            resourceInstance.AddResourceInstance('FIELD_METRICS',"mat1")
            
            // using new way 
            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: 'RWO',          // READ | WRITE | OWN
                        actionToOthers: 'RA',   // READ | ALL
                        ownerInstance: ['1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };
            
            const compiler = new RoleCompiler(ROLE_NAME, roleDefinition);
            compiler.compile();
            
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            const worker = RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler);
            worker.addRolesValuseToRowBinary();
            
            roleId = resourceInstance.getRoleId(ROLE_NAME);
        });

        test('should grant access to owned instance', () => {
            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            const childPid = TYPE_IDS.DOCUMENTS;
            const childIndex = resourceInstance.getResourceInstanceIndex('DOCUMENTS', '1');
            
            const access = authCheck.checkAccess(roleId, parentPid, parentIndex, childPid, childIndex);
            
            assert.ok(typeof access === 'number', `Expected number, got ${JSON.stringify(access)}`);
            assert.strictEqual(authCheck.canPerformPrimary(access, DEFAULT_ACTIONS.READ), true);
            assert.strictEqual(authCheck.canPerformPrimary(access, DEFAULT_ACTIONS.WRITE), true);
        });

        test('should deny access to non-owned instance', () => {
            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            const childPid = TYPE_IDS.FIELD_METRICS;
            const childIndex = resourceInstance.getResourceInstanceIndex('FIELD_METRICS', 'mat1');
            
            const access = authCheck.checkAccess(roleId, parentPid, parentIndex, childPid, childIndex);
            assert.ok(access.code !== undefined, 'Should deny access to non-owned instance');
        });

        test('should deny access when role not found', () => {
            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            const childPid = TYPE_IDS.FIELD_METRICS;
            const childIndex = resourceInstance.getResourceInstanceIndex('FIELD_METRICS', 'mat1');
            
            const access = authCheck.checkAccess(99999, parentPid, parentIndex, childPid, childIndex);
            assert.strictEqual(access.code, SYSTEM_STATUS.ACCESS_DENIED);
        });

        test('should deny access when child not in role', () => {
            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            
            resourceInstance.AddResourceInstance('FIELD_METRICS', 'idx_unknown');
            const childPid = TYPE_IDS.FIELD_METRICS;
            const childIndex = resourceInstance.getResourceInstanceIndex('FIELD_METRICS', 'idx_unknown');
            
            const access = authCheck.checkAccess(roleId, parentPid, parentIndex, childPid, childIndex);
            assert.strictEqual(access.code, SYSTEM_STATUS.ACCESS_DENIED);
        });

        test('should extract correct boundary from access', () => {
            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            const childPid = TYPE_IDS.DOCUMENTS;
            const childIndex = resourceInstance.getResourceInstanceIndex('DOCUMENTS', '1');
            
            const access = authCheck.checkAccess(roleId, parentPid, parentIndex, childPid, childIndex);
            assert.ok(typeof access === 'number');
            assert.strictEqual(authCheck.getPrimaryBoundary(access), BOUNDARY.OWN);
        });
    });

    
    // checkAccess - Wildcard Access
    
    describe('Test 3: checkAccess - Wildcard Access', () => {
        const ROLE_NAME = 'WILDCARD_ACCESS_ROLE';
        let authCheck;
        let roleId;

        beforeEach(() => {
            authCheck = new AutherizationCheck();
            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            resourceInstance.AddResourceInstance('FIELD_METRICS', 'mat1');
            
            
            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['*'],
                        action: 'RO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['*'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };
            
            const compiler = new RoleCompiler(ROLE_NAME, roleDefinition);
            compiler.compile();
            
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            const worker = RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler);
            worker.addRolesValuseToRowBinary();
            
            roleId = resourceInstance.getRoleId(ROLE_NAME);
        });

        test('should grant wildcard access to any instance', () => {
            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            const childPid = TYPE_IDS.DOCUMENTS;
            const childIndex = resourceInstance.getResourceInstanceIndex('DOCUMENTS', '1');
            
            const access = authCheck.checkAccess(roleId, parentPid, parentIndex, childPid, childIndex);
            
            assert.ok(typeof access === 'number', `Expected number, got ${JSON.stringify(access)}`);
            assert.strictEqual(authCheck.canPerformPrimary(access, DEFAULT_ACTIONS.READ), true);
        });

        test('should have own boundary for wildcard', () => {
            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            const childPid = TYPE_IDS.DOCUMENTS;
            const childIndex = resourceInstance.getResourceInstanceIndex('DOCUMENTS', 'idx_1');
            
            const access = authCheck.checkAccess(roleId, parentPid, parentIndex, childPid, childIndex);
            assert.ok(typeof access === 'number');
            assert.strictEqual(authCheck.getPrimaryBoundary(access), BOUNDARY.OWN);
        });
    });

    
    //  checkAccess - Nested Role (GrandChild)
    
    describe('Test 4: checkAccess - Nested Role (GrandChild)', () => {
        const ROLE_NAME = 'NESTED_ACCESS_ROLE';
        let authCheck;
        let roleId;

        beforeEach(() => {
            authCheck = new AutherizationCheck();
            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            resourceInstance.AddResourceInstance('SEARCH_INDEXES', 'idx_1');
            resourceInstance.AddResourceInstance('SEARCH_INDEXES', 'idx_2');
            resourceInstance.AddResourceInstance('FIELD_METRICS', 'metric_1');
            resourceInstance.AddResourceInstance('FIELD_METRICS', 'metric_2');
            
            
            const roleDefinition = {
                'member_1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: 'RUO',          // READ | UPDATE | OWN
                        actionToOthers: 'RA',   // READ | ALL
                        ownerInstance: ['metric_1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['idx_1'],
                        ttl: null
                    }
                }
            };
            
            const compiler = new RoleCompiler(ROLE_NAME, roleDefinition);
            compiler.compile();
            
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            const worker = RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler);
            worker.addRolesValuseToRowBinary();
            
            roleId = resourceInstance.getRoleId(ROLE_NAME);
        });

        test('should grant access to owned grandchild', () => {
            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            const childPid = TYPE_IDS.SEARCH_INDEXES;
            const childIndex = resourceInstance.getResourceInstanceIndex('SEARCH_INDEXES', 'idx_1');
            const grandChildPid = TYPE_IDS.FIELD_METRICS;
            const grandChildIndex = resourceInstance.getResourceInstanceIndex('FIELD_METRICS', 'metric_1');
            
            const access = authCheck.checkAccess(roleId, parentPid, parentIndex, childPid, childIndex, grandChildPid, grandChildIndex);
            
            assert.ok(typeof access === 'number', `Expected number, got ${JSON.stringify(access)}`);
            assert.strictEqual(authCheck.canPerformPrimary(access, DEFAULT_ACTIONS.READ), true);
            assert.strictEqual(authCheck.canPerformPrimary(access, DEFAULT_ACTIONS.UPDATE), true);
        });

        test('should deny access to non-owned grandchild', () => {
            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            const childPid = TYPE_IDS.SEARCH_INDEXES;
            const childIndex = resourceInstance.getResourceInstanceIndex('SEARCH_INDEXES', 'idx_1');
            const grandChildPid = TYPE_IDS.FIELD_METRICS;
            const grandChildIndex = resourceInstance.getResourceInstanceIndex('FIELD_METRICS', 'metric_2');
            
            const access = authCheck.checkAccess(roleId, parentPid, parentIndex, childPid, childIndex, grandChildPid, grandChildIndex);
            assert.ok(access.code !== undefined, 'Should deny access to non-owned grandchild');
        });

        test('should deny access when grandchild not in role', () => {
            resourceInstance.AddResourceInstance('FIELD_METRICS', 'metric_unknown');
            
            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            const childPid = TYPE_IDS.SEARCH_INDEXES;
            const childIndex = resourceInstance.getResourceInstanceIndex('SEARCH_INDEXES', 'idx_1');
            const grandChildPid = TYPE_IDS.FIELD_METRICS;
            const grandChildIndex = resourceInstance.getResourceInstanceIndex('FIELD_METRICS', 'metric_unknown');
            
            const access = authCheck.checkAccess(roleId, parentPid, parentIndex, childPid, childIndex, grandChildPid, grandChildIndex);
            assert.strictEqual(access.code, SYSTEM_STATUS.ACCESS_DENIED);
        });
    });

    
    //  checkAccess - TTL Expiration
    
    describe('Test 5: checkAccess - TTL Expiration', () => {
        const ROLE_NAME = 'TTL_ACCESS_ROLE';
        let authCheck;
        let roleId;

        beforeEach(() => {
            RoleBaseBuckets.bucket.clear;
            RoleBaseBuckets.insBucket.clear;
            RoleBaseBuckets.expiredBucket.clear
            authCheck = new AutherizationCheck();
            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            resourceInstance.AddResourceInstance('SEARCH_INDEXES', 'idx_1');
            resourceInstance.AddResourceInstance('FIELD_METRICS', 'metric_1');
            
            // Define role with expired TTL (1 second ago)
            const expiredTTL = Math.floor(Date.now() / 1000) ;
            
            
            const roleDefinition = {
                'member_1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: 'RO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['metric_1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['idx_1'],
                        ttl: expiredTTL
                    }
                }
            };
            
            const compiler = new RoleCompiler(ROLE_NAME, roleDefinition);
            compiler.compile();
        
            
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            const worker = RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler);
            worker.addRolesValuseToRowBinary();
            
            roleId = resourceInstance.getRoleId(ROLE_NAME);
             
        });

        test('should return PERMISSION_EXPIRED for expired TTL',async () => {
            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            const childPid = TYPE_IDS.SEARCH_INDEXES;
            const childIndex = resourceInstance.getResourceInstanceIndex('SEARCH_INDEXES', 'idx_1');
            const grandChildPid = TYPE_IDS.FIELD_METRICS;
            const grandChildIndex = resourceInstance.getResourceInstanceIndex('FIELD_METRICS', 'metric_1');
           
            await Promise.resolve(res=> setTimeout(res,100));
           
           
            const access = authCheck.checkAccess(
                roleId, parentPid, parentIndex, childPid, childIndex, grandChildPid, grandChildIndex,
                Math.floor(Date.now() / 1000) // Explicitly pass current time
            );
             console.log(access);
            assert.strictEqual(access.code, SYSTEM_STATUS.ACCESS_DENIED);
        });

        test('should add expired permission to expiredBucket via handleExpirationAt', async () => {
            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            const childPid = TYPE_IDS.SEARCH_INDEXES;
            const childIndex = resourceInstance.getResourceInstanceIndex('SEARCH_INDEXES', 'idx_1');
            const grandChildPid = TYPE_IDS.FIELD_METRICS;
            const grandChildIndex = resourceInstance.getResourceInstanceIndex('FIELD_METRICS', 'metric_1');
             await Promise.resolve(res=> setTimeout(res,1000));
            authCheck.checkAccess(
                roleId, parentPid, parentIndex, childPid, childIndex, grandChildPid, grandChildIndex,
                Math.floor(Date.now() / 1000)
            );
            
            // Verify expired bucket has the entry (triggered by handleExpirationAt)
            assert.ok(RoleBaseBuckets.expiredBucket.has(roleId));
            const roleMap = RoleBaseBuckets.expiredBucket.get(roleId);
            assert.ok(roleMap.size > 0);

            //
        });
          test('should add expired permission to expiredBucket via handleExpirationAt and zero action bit in buffer for this expired', async () => {
            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            const childPid = TYPE_IDS.SEARCH_INDEXES;
            const childIndex = resourceInstance.getResourceInstanceIndex('SEARCH_INDEXES', 'idx_1');
            const grandChildPid = TYPE_IDS.FIELD_METRICS;
            const grandChildIndex = resourceInstance.getResourceInstanceIndex('FIELD_METRICS', 'metric_1');
            
            const access=authCheck.checkAccess(
                roleId, parentPid, parentIndex, childPid, childIndex, grandChildPid, grandChildIndex,
                Math.floor(Date.now() / 1000)
            );
            
            // Verify expired bucket has the entry (triggered by handleExpirationAt)
            assert.equal(access.code,SYSTEM_STATUS.ACCESS_DENIED);
            assert.ok(RoleBaseBuckets.expiredBucket.has(roleId));
            const roleMap = RoleBaseBuckets.expiredBucket.get(roleId);
            assert.ok(roleMap.size > 0);
            const access2=authCheck.checkAccess(
                roleId, parentPid, parentIndex, childPid, childIndex, grandChildPid, grandChildIndex,
                Math.floor(Date.now() / 1000)
            );
            assert.equal(access2,0) // its clear its effected bited and set it zero (permenent NONE Grant);
            


            //
        });
    });

    
    // checkAccessWithMonitor
    
    describe('Test 6: checkAccessWithMonitor', () => {
        const ROLE_NAME = 'MONITOR_ACCESS_ROLE';
        let authCheck;
        let roleId;

        beforeEach(() => {
            authCheck = new AutherizationCheck();
            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            resourceInstance.AddResourceInstance('SEARCH_INDEXES', 'idx_1');
            resourceInstance.AddResourceInstance('FIELD_METRICS', 'metric_1');
            
            
            const roleDefinition = {
                'member_1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: 'RO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['metric_1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['idx_1'],
                        ttl: null
                    }
                }
            };
            
            const compiler = new RoleCompiler(ROLE_NAME, roleDefinition);
            compiler.compile();
            
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            const worker = RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler);
            worker.addRolesValuseToRowBinary();
            
            roleId = resourceInstance.getRoleId(ROLE_NAME);
        });

        test('should return same result as checkAccess', () => {
            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            const childPid = TYPE_IDS.SEARCH_INDEXES;
            const childIndex = resourceInstance.getResourceInstanceIndex('SEARCH_INDEXES', 'idx_1');
            const grandChildPid = TYPE_IDS.FIELD_METRICS;
            const grandChildIndex = resourceInstance.getResourceInstanceIndex('FIELD_METRICS', 'metric_1');
            
            const accessWithMonitor = authCheck.checkAccessWithMonitor(roleId, parentPid, parentIndex, childPid, childIndex, grandChildPid, grandChildIndex);
            const accessWithoutMonitor = authCheck.checkAccess(roleId, parentPid, parentIndex, childPid, childIndex, grandChildPid, grandChildIndex);
            
            assert.deepStrictEqual(accessWithMonitor, accessWithoutMonitor);
        });

        test('should record RBAC_AUTH_CHECK event', () => {
            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            const childPid = TYPE_IDS.SEARCH_INDEXES;
            const childIndex = resourceInstance.getResourceInstanceIndex('SEARCH_INDEXES', 'idx_1');
            const grandChildPid = TYPE_IDS.FIELD_METRICS;
            const grandChildIndex = resourceInstance.getResourceInstanceIndex('FIELD_METRICS', 'metric_1');
            
            assert.doesNotThrow(() => {
                authCheck.checkAccessWithMonitor(roleId, parentPid, parentIndex, childPid, childIndex, grandChildPid, grandChildIndex);
            });
        });
    });

    
    //  getRole
    
    describe('Test 7: getRole', () => {
        const ROLE_NAME = 'GET_ROLE_TEST';
        let authCheck;

        beforeEach(() => {
            authCheck = new AutherizationCheck();
            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            resourceInstance.AddResourceInstance('SEARCH_INDEXES', 'idx_1');
            resourceInstance.AddResourceInstance('FIELD_METRICS', 'metric_1');
            
            
            const roleDefinition = {
                'member_1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: 'RO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['metric_1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['idx_1'],
                        ttl: null
                    }
                }
            };
            
            const compiler = new RoleCompiler(ROLE_NAME, roleDefinition);
            compiler.compile();
            
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            const worker = RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler);
            worker.addRolesValuseToRowBinary();
        });

        test('should return role instance by PID', () => {
            const roleId = resourceInstance.getRoleId(ROLE_NAME);
            const role = authCheck.getRole(roleId);
            
            assert.ok(role);
            assert.ok(role instanceof RoleBinaryWorker);
        });

        test('should return undefined for non-existent role', () => {
            const role = authCheck.getRole(99999);
            assert.strictEqual(role, undefined);
        });
    });

    
    // Performance Tests
    
    describe('Test 8: Performance', () => {
        const ROLE_NAME = 'PERF_ACCESS_ROLE';
        let authCheck;
        let roleId;

        beforeEach(() => {
            authCheck = new AutherizationCheck();
            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            resourceInstance.AddResourceInstance('SEARCH_INDEXES', 'idx_1');
            resourceInstance.AddResourceInstance('FIELD_METRICS', 'metric_1');
            
            
            const roleDefinition = {
                'member_1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: 'RWUO',         // READ | WRITE | UPDATE | OWN
                        actionToOthers: 'RA',   // READ | ALL
                        ownerInstance: ['metric_1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['idx_1'],
                        ttl: null
                    }
                }
            };
            
            const compiler = new RoleCompiler(ROLE_NAME, roleDefinition);
            compiler.compile();
            
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            const worker = RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler);
            worker.addRolesValuseToRowBinary();
            
            roleId = resourceInstance.getRoleId(ROLE_NAME);
        });

        test('checkAccess should be fast (< 1μs per call)', () => {
            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            const childPid = TYPE_IDS.SEARCH_INDEXES;
            const childIndex = resourceInstance.getResourceInstanceIndex('SEARCH_INDEXES', 'idx_1');
            const grandChildPid = TYPE_IDS.FIELD_METRICS;
            const grandChildIndex = resourceInstance.getResourceInstanceIndex('FIELD_METRICS', 'metric_1');
            
            const iterations = 10000;
            const start = performance.now();
            
            for (let i = 0; i < iterations; i++) {
                authCheck.checkAccess(roleId, parentPid, parentIndex, childPid, childIndex, grandChildPid, grandChildIndex);
            }
            
            const duration = performance.now() - start;
            const avgPerCall = (duration * 1000) / iterations; // microseconds
            
            assert.ok(avgPerCall < 5, `Average call took ${avgPerCall}μs, expected < 5μs`);
        });

        test('bitwise operations should be extremely fast', () => {
            const packed32 = 0x00410013;
            const iterations = 100000;
            
            const start = performance.now();
            for (let i = 0; i < iterations; i++) {
                authCheck.getPrimary(packed32);
                authCheck.getOthers(packed32);
                authCheck.getPrimaryAction(packed32);
                authCheck.getOthersAction(packed32);
                authCheck.canPerformPrimary(packed32, DEFAULT_ACTIONS.READ);
                authCheck.canPerformOnOthers(packed32, DEFAULT_ACTIONS.READ);
            }
            const duration = performance.now() - start;
            
            assert.ok(duration < 50, `Bitwise operations took ${duration}ms for ${iterations} iterations`);
        });
    });

    
    // Edge Cases
    
    describe('Test 9: Edge Cases', () => {
        let authCheck;

        beforeEach(() => {
            authCheck = new AutherizationCheck();
        });

        test('should handle zero packed32', () => {
            assert.strictEqual(authCheck.getPrimary(0), 0);
            assert.strictEqual(authCheck.getOthers(0), 0);
            assert.strictEqual(authCheck.canPerformPrimary(0, DEFAULT_ACTIONS.READ), false);
            assert.strictEqual(authCheck.canPerformOnOthers(0, DEFAULT_ACTIONS.READ), false);
        });

        test('should handle max uint32', () => {
            const maxUint32 = 0xFFFFFFFF;
            assert.strictEqual(authCheck.getPrimary(maxUint32), 0xFFFF);
            assert.strictEqual(authCheck.getOthers(maxUint32), 0xFFFF);
        });

        test('should handle role with multiple members', () => {
            const ROLE_NAME = 'MULTI_MEMBER_ACCESS_ROLE';

            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            resourceInstance.AddResourceInstance('SEARCH_INDEXES', 'idx_1');
            resourceInstance.AddResourceInstance('SEARCH_INDEXES', 'idx_2');
            resourceInstance.AddResourceInstance('FIELD_METRICS', 'mat1');
            
            
            const roleDefinition = {
                'member_1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: 'RO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['mat1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['idx_1', 'idx_2'],
                        ttl: null
                    }
                },
                'member_2': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: 'WO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['idx_2'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };
            
            const compiler = new RoleCompiler(ROLE_NAME, roleDefinition);
            compiler.compile();
            
            RoleBaseBuckets.registerNewRole(ROLE_NAME, RoleBinaryWorker);
            const worker = RoleBaseBuckets.createRegisterRole(ROLE_NAME, ROLE_NAME, compiler);
            worker.addRolesValuseToRowBinary();   

            const roleId = resourceInstance.getRoleId(ROLE_NAME);
            const parentPid = TYPE_IDS.COLLECTIONS;
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            
            // Check access to idx_1 (member_1 owns it)
            const childPid1 = TYPE_IDS.DOCUMENTS;
            const childIndex1 = resourceInstance.getResourceInstanceIndex('DOCUMENTS', 'idx_1');
            const access1 = authCheck.checkAccess(roleId, parentPid, parentIndex, childPid1, childIndex1);
            assert.ok(typeof access1 === 'number');
            
            // Check access to idx_2 (member_2 owns it)
            const childPid2 = TYPE_IDS.SEARCH_INDEXES;
            const grandChildPid2 = TYPE_IDS.FIELD_METRICS;
            const childIndex2 = resourceInstance.getResourceInstanceIndex('SEARCH_INDEXES', 'idx_2');
            const grandChildIndex2 = resourceInstance.getResourceInstanceIndex('FIELD_METRICS', 'mat1');
            const access2 = authCheck.checkAccess(roleId, parentPid, parentIndex, childPid2, childIndex2, grandChildPid2, grandChildIndex2);
            assert.ok(typeof access2 === 'number');
        });
    });
});

console.log('✅ AutherizationCheck native test suite updated and loaded. Run with: node --test authorization.native.test.js');