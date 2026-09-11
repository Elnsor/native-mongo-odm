
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { resourceInstance } from '../buckets/systemReourcesInstances.js';
import { RoleCompiler } from '../compiler/schema-parser.js';
import { 
    TYPE_IDS, 
    SYSTEM_STATUS,
    SIZE_POWER,
} from '../constant/resourceType.js';

describe('RoleCompiler - Integration Tests with Real GroupRole', () => {
    
    beforeEach(() => {
        // Reset singleton state
        resourceInstance.reset();
        SIZE_POWER.WILDCARD = 32;
    });

    // ==========================================================================
    // TEST SUITE 1: Constructor & Basic Setup
    // ==========================================================================
    describe('Test 1: Constructor & Initialization', () => {
        test('should initialize with correct properties', () => {

            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            resourceInstance.AddResourceInstance('DOCUMENTS', 'doc_1');

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: ['READ'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['doc_1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('TEST_ROLE', roleDefinition);

            assert.strictEqual(compiler.groupRoleName, 'TEST_ROLE');
            assert.ok(compiler.striders);
            assert.ok(compiler.schemaInsance);
            assert.ok(compiler.globalstriders);
            assert.ok(compiler.childCompactTree instanceof Map);
            assert.ok(compiler.wildcardCompactTree instanceof Map);
            assert.ok(compiler.pTi instanceof Map);
            assert.ok(compiler.schemaSlices instanceof Map);
        });

        test('should inherit from ResourceRoleGroupManager', () => {

            const compiler = new RoleCompiler('TEST_ROLE', {});

            assert.ok(compiler.ListOfGroups);
            assert.ok(compiler._pathsBuffer);
            assert.ok(typeof compiler.setPathBuffer === 'function');
            assert.ok(typeof compiler.validateRolElement === 'function');
        });

        test('should throw error if role already exists (without update flag)', () => {
            resourceInstance.AddRole('TEST_ROLE');
          

            
            assert.throws(() => {
                new RoleCompiler('TEST_ROLE', {});
            }, /ResourceRole Error/);
        });

        test('should not throw error if update=true and role exists', () => {

            
            assert.doesNotThrow(() => {
                new RoleCompiler('UPDATE_ROLE', {}, true);
            });
        });
    });

    // ==========================================================================
    // TEST SUITE 2: geteffectedActionBoundary
    // ==========================================================================
    describe('Test 2: geteffectedActionBoundary', () => {
        let compiler;

        beforeEach(() => {

            compiler = new RoleCompiler('ACTION_TEST_ROLE', {});
        });

        test('should combine actions correctly', () => {
            const effects = compiler.geteffectedActionBoundary(['READ', 'WRITE'], 'OWN');
            
            // READ = 1, WRITE = 2, OWN = 16
            // Expected: 1 | 2 | 16 = 19
            assert.strictEqual(effects, 19);
        });

        test('should handle single action', () => {
            const effects = compiler.geteffectedActionBoundary(['READ'], 'OWN');
            // READ = 1, OWN = 16
            assert.strictEqual(effects, 17);
        });

        test('should handle all actions', () => {
            const effects = compiler.geteffectedActionBoundary(
                ['READ', 'WRITE', 'UPDATE', 'DELETE'], 
                'ALL'
            );
            // 1 | 2 | 4 | 8 | 64 = 79
            assert.strictEqual(effects, 79);
        });

        test('should handle NONE boundary', () => {
            const effects = compiler.geteffectedActionBoundary(['READ'], 'NONE');
            // READ = 1, NONE = 0
            assert.strictEqual(effects, 1);
        });

        test('should handle LIMITED boundary', () => {
            const effects = compiler.geteffectedActionBoundary(['READ'], 'LIMITED');
            // READ = 1, LIMITED = 32
            assert.strictEqual(effects, 33);
        });
    });

    // ==========================================================================
    // TEST SUITE 3: Compact Tree Registration
    // ==========================================================================
    describe('Test 3: Compact Tree Registration', () => {
        let compiler;

        beforeEach(() => {

            compiler = new RoleCompiler('COMPACT_TEST_ROLE', {});
        });

        test('registerChildCompact should create new compact index', () => {
            const compact = compiler.registerChildCompact(0, TYPE_IDS.DOCUMENTS, 0);
            assert.strictEqual(compact, 0);
        });

        test('registerChildCompact should increment for different children', () => {
            const compact1 = compiler.registerChildCompact(0, TYPE_IDS.DOCUMENTS, 0);
            const compact2 = compiler.registerChildCompact(0, TYPE_IDS.DOCUMENTS, 1);
            const compact3 = compiler.registerChildCompact(0, TYPE_IDS.DOCUMENTS, 2);

            assert.strictEqual(compact1, 0);
            assert.strictEqual(compact2, 1);
            assert.strictEqual(compact3, 2);
        });

        test('registerChildCompact should return existing compact for duplicate', () => {
            const compact1 = compiler.registerChildCompact(0, TYPE_IDS.DOCUMENTS, 0);
            const compact2 = compiler.registerChildCompact(0, TYPE_IDS.DOCUMENTS, 0);

            assert.strictEqual(compact1, compact2);
        });

        test('registerChildCompact should handle different parent globals', () => {
            const compact1 = compiler.registerChildCompact(0, TYPE_IDS.DOCUMENTS, 0);
            const compact2 = compiler.registerChildCompact(1, TYPE_IDS.DOCUMENTS, 0);

            assert.strictEqual(compact1, 0);
            assert.strictEqual(compact2, 0); // Different parent, new tree
        });

        test('registerChildCompact should handle different child types', () => {
            const compact1 = compiler.registerChildCompact(0, TYPE_IDS.DOCUMENTS, 0);
            const compact2 = compiler.registerChildCompact(0, TYPE_IDS.SEARCH_INDEXES, 0);

            assert.strictEqual(compact1, 0);
            assert.strictEqual(compact2, 0); // Different child type
        });

        test('registerWildCardCompact should create new compact index', () => {
            const compact = compiler.registerWildCardCompact(TYPE_IDS.COLLECTIONS, TYPE_IDS.DOCUMENTS, 0);
            assert.strictEqual(compact, 0);
        });

        test('getChildCompact should return compact index', () => {
            compiler.registerChildCompact(0, TYPE_IDS.DOCUMENTS, 0);
            const compact = compiler.getChildCompact(0, TYPE_IDS.DOCUMENTS, 0);
            assert.strictEqual(compact, 0);
        });

        test('getChildCompact should return -1 for non-existent', () => {
            const compact = compiler.getChildCompact(999, TYPE_IDS.DOCUMENTS, 0);
            assert.strictEqual(compact, -1);
        });

        test('getWildCardCompact should return compact index', () => {
            compiler.registerWildCardCompact(TYPE_IDS.COLLECTIONS, TYPE_IDS.DOCUMENTS, 0);
            const compact = compiler.getWildCardCompact(TYPE_IDS.COLLECTIONS, TYPE_IDS.DOCUMENTS, 0);
            assert.strictEqual(compact, 0);
        });

        test('getWildCardCompact should return -1 for non-existent', () => {
            const compact = compiler.getWildCardCompact(999, TYPE_IDS.DOCUMENTS, 0);
            assert.strictEqual(compact, -1);
        });

        test('getChildCompactTree should return the tree', () => {
            compiler.registerChildCompact(0, TYPE_IDS.DOCUMENTS, 0);
            const tree = compiler.getChildCompactTree();
            assert.ok(tree instanceof Map);
            assert.ok(tree.size > 0);
        });

        test('getWildCardCompactTree should return the tree', () => {
            compiler.registerWildCardCompact(TYPE_IDS.COLLECTIONS, TYPE_IDS.DOCUMENTS, 0);
            const tree = compiler.getWildCardCompactTree();
            assert.ok(tree instanceof Map);
            assert.ok(tree.size > 0);
        });
    });

    // ==========================================================================
    // TEST SUITE 4: parsedGroupRoleValidation
    // ==========================================================================
    describe('Test 4: parsedGroupRoleValidation', () => {
        test('should return true for valid role definition', () => {

            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            resourceInstance.AddResourceInstance('DOCUMENTS', 'doc_1');

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: ['READ'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['doc_1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('VALID_ROLE', roleDefinition);
            const result = compiler.parsedGroupRoleValidation();
            assert.strictEqual(result, true);
        });

        test('should return error for invalid parent resource', () => {

            resourceInstance.AddResourceInstance('DOCUMENTS', 'doc_1');

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'INVALID_RESOURCE',
                        parentInstance: ['users_collection'],
                        action: ['READ'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['doc_1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('INVALID_PARENT_ROLE', roleDefinition);
            const result = compiler.parsedGroupRoleValidation();
            assert.strictEqual(result.code, SYSTEM_STATUS.INVALID_RESOURCE_PID);
        });

        test('should return error for empty parent instance list', () => {

            resourceInstance.AddResourceInstance('DOCUMENTS', 'doc_1');

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: [],
                        action: ['READ'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['doc_1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('EMPTY_PARENT_ROLE', roleDefinition);
            const result = compiler.parsedGroupRoleValidation();
            assert.strictEqual(result.code, SYSTEM_STATUS.RESOURCES_EMPTY_LIST);
        });

        test('should return error for wildcard mixed with other instances', () => {

            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            resourceInstance.AddResourceInstance('DOCUMENTS', 'doc_1');

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['*', 'users_collection'],
                        action: ['READ'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['doc_1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('WILDCARD_MIX_ROLE', roleDefinition);
            const result = compiler.parsedGroupRoleValidation();
            assert.strictEqual(result.code, SYSTEM_STATUS.WILDCARD_WITHE_INSTANCE);
        });

        test('should return error for invalid hierarchy', () => {

            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            resourceInstance.AddResourceInstance('DOCUMENTS', 'doc_1');

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'USERS', // DOCUMENTS is not child of USERS
                        parentInstance: ['users_collection'],
                        action: ['READ'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['doc_1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('INVALID_HIERARCHY_ROLE', roleDefinition);
            const result = compiler.parsedGroupRoleValidation();
            assert.strictEqual(result.code, SYSTEM_STATUS.INVALID_HIERARCHY);
        });

        test('should validate nested role correctly', () => {

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

            const compiler = new RoleCompiler('VALID_NESTED_ROLE', roleDefinition);
            const result = compiler.parsedGroupRoleValidation();
            assert.strictEqual(result, true);
        });

        test('should return error for invalid nested hierarchy', () => {

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
                        nested: 'DOCUMENTS', // FIELD_METRICS is not child of DOCUMENTS
                        nestedInstance: ['idx_1'],
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('INVALID_NESTED_ROLE', roleDefinition);
            const result = compiler.parsedGroupRoleValidation();
            assert.strictEqual(result.code, SYSTEM_STATUS.INVALID_HIERARCHY);
        });
    });

    // ==========================================================================
    // TEST SUITE 5: parsedGroupRole (Parsing Phase)
    // ==========================================================================
    describe('Test 5: parsedGroupRole', () => {
        test('should parse simple role and populate pTi', () => {

            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            resourceInstance.AddResourceInstance('DOCUMENTS', 'doc_1');

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: ['READ'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['doc_1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('PARSE_SIMPLE_ROLE', roleDefinition);
            const result = compiler.parsedGroupRole();
            assert.strictEqual(result, true);

            // Verify pTi is populated
            assert.ok(compiler.pTi.has(TYPE_IDS.COLLECTIONS));
            const instances = compiler.pTi.get(TYPE_IDS.COLLECTIONS).instance;
            assert.ok(instances.size > 0);
        });

        test('should parse nested role and populate pTi', () => {

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

            const compiler = new RoleCompiler('PARSE_NESTED_ROLE', roleDefinition);
            const result = compiler.parsedGroupRole();
            assert.strictEqual(result, true);

            // Verify pTi is populated
            assert.ok(compiler.pTi.has(TYPE_IDS.COLLECTIONS));
        });

        test('should populate childCompactTree', () => {

            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            resourceInstance.AddResourceInstance('DOCUMENTS', 'doc_1');

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: ['READ'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['doc_1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('COMPACT_TREE_ROLE', roleDefinition);
            compiler.parsedGroupRole();

            assert.ok(compiler.childCompactTree.size > 0);
        });

        test('should populate wildcardCompactTree for wildcard roles', () => {

            resourceInstance.AddResourceInstance('DOCUMENTS', 'doc_1');

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['*'],
                        action: ['READ'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['*'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('WILDCARD_TREE_ROLE', roleDefinition);
            compiler.parsedGroupRole();

            assert.ok(compiler.wildcardCompactTree.size > 0);
        });

        test('should populate pathsBuffer', () => {

            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            resourceInstance.AddResourceInstance('DOCUMENTS', 'doc_1');

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: ['READ'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['doc_1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('PATHS_BUFFER_ROLE', roleDefinition);
            compiler.parsedGroupRole();

            assert.ok(compiler._pathsBufferInstanceCounts > 0);
        });

        test('should register role member', () => {

            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            resourceInstance.AddResourceInstance('DOCUMENTS', 'doc_1');

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: ['READ'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['doc_1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('MEMBER_REGISTER_ROLE', roleDefinition);
            compiler.parsedGroupRole();

            const roleId = resourceInstance.getRoleId('MEMBER_REGISTER_ROLE');
            const memberId = resourceInstance.getRoleMemberIndexByName(roleId, 'member_1');
            assert.ok(memberId !== undefined);
        });

        test('should handle multiple members', () => {

            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            resourceInstance.AddResourceInstance('DOCUMENTS', 'doc_1');
            resourceInstance.AddResourceInstance('DOCUMENTS', 'doc_2');

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: ['READ'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['doc_1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                },
                'member_2': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: ['WRITE'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['doc_2'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('MULTI_MEMBER_ROLE', roleDefinition);
            const result = compiler.parsedGroupRole();
            assert.strictEqual(result, true);

            const roleId = resourceInstance.getRoleId('MULTI_MEMBER_ROLE');
            const member1Id = resourceInstance.getRoleMemberIndexByName(roleId, 'member_1');
            const member2Id = resourceInstance.getRoleMemberIndexByName(roleId, 'member_2');
            assert.ok(member1Id !== undefined);
            assert.ok(member2Id !== undefined);
            assert.notStrictEqual(member1Id, member2Id);
        });
    });

    // ==========================================================================
    // TEST SUITE 6: Striders Calculation
    // ==========================================================================
    describe('Test 6: Striders Calculation', () => {
        test('calculateTotalStridersSchemaSlice should calculate striders', () => {

            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            resourceInstance.AddResourceInstance('DOCUMENTS', 'doc_1');

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: ['READ'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['doc_1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('STRIDER_CALC_ROLE', roleDefinition);
            compiler.parsedGroupRole();
            compiler.calculateTotalStridersSchemaSlice();

            assert.ok(compiler.striders.totalBytesSize > 0);
            assert.ok(compiler.striders[TYPE_IDS.COLLECTIONS]);
        });

        test('should have correct strider structure', () => {

            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            resourceInstance.AddResourceInstance('DOCUMENTS', 'doc_1');

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: ['READ'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['doc_1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('STRIDER_STRUCT_ROLE', roleDefinition);
            compiler.parsedGroupRole();
            compiler.calculateTotalStridersSchemaSlice();

            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            const strider = compiler.striders[TYPE_IDS.COLLECTIONS][parentIndex];

            assert.ok(strider.striderSize);
            assert.ok(strider.striderOffset);
            assert.ok(strider.shift !== undefined);
        });

        test('should populate globalstriders for wildcard', () => {

            resourceInstance.AddResourceInstance('DOCUMENTS', 'doc_1');

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['*'],
                        action: ['READ'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['*'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('GLOBAL_STRIDER_ROLE', roleDefinition);
            compiler.parsedGroupRole();
            compiler.calculateTotalStridersSchemaSlice();

            assert.ok(compiler.globalstriders[TYPE_IDS.COLLECTIONS]);
            assert.ok(compiler.globalstriders[TYPE_IDS.COLLECTIONS].shift !== undefined);
            assert.ok(compiler.globalstriders[TYPE_IDS.COLLECTIONS].totalNodeSize > 0);
        });

        test('should calculate striders for nested role', () => {

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

            const compiler = new RoleCompiler('NESTED_STRIDER_ROLE', roleDefinition);
            compiler.parsedGroupRole();
            compiler.calculateTotalStridersSchemaSlice();

            assert.ok(compiler.striders.totalBytesSize > 0);
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            const strider = compiler.striders[TYPE_IDS.COLLECTIONS][parentIndex];
            
            // Should have striders for both SEARCH_INDEXES and FIELD_METRICS
            assert.ok(strider.striderSize[TYPE_IDS.SEARCH_INDEXES] !== undefined);
            assert.ok(strider.striderSize[TYPE_IDS.FIELD_METRICS] !== undefined);
        });
    });

    // ==========================================================================
    // TEST SUITE 7: Full Compilation (compile method)
    // ==========================================================================
    describe('Test 7: Full Compilation', () => {
        test('compile should complete successfully for simple role', () => {

            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            resourceInstance.AddResourceInstance('DOCUMENTS', 'doc_1');

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: ['READ', 'WRITE'],
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

            const compiler = new RoleCompiler('COMPILE_SIMPLE_ROLE', roleDefinition);
            const result = compiler.compile();

            // compile() doesn't return anything on success, just doesn't throw
            assert.ok(compiler.striders.totalBytesSize > 0);
            assert.ok(compiler.pTi.size > 0);
            assert.ok(compiler.childCompactTree.size > 0);
        });

        test('compile should throw error for invalid role', () => {

            resourceInstance.AddResourceInstance('DOCUMENTS', 'doc_1');

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'INVALID_RESOURCE',
                        parentInstance: ['users_collection'],
                        action: ['READ'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['doc_1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('COMPILE_INVALID_ROLE', roleDefinition);
             const cm =compiler.compile();
                  
            assert.equal(cm.code,SYSTEM_STATUS.INVALID_RESOURCE_PID);
            
        });

        test('compile should handle nested role', () => {

            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            resourceInstance.AddResourceInstance('SEARCH_INDEXES', 'idx_1');
            resourceInstance.AddResourceInstance('FIELD_METRICS', 'metric_1');

            const roleDefinition = {
                'member_1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: ['READ', 'UPDATE'],
                        boundary: 'OWN',
                        actionToOthers: ['READ'],
                        boundaryToOthers: 'ALL',
                        ownerInstance: ['metric_1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['idx_1'],
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('COMPILE_NESTED_ROLE', roleDefinition);
            compiler.compile();

            assert.ok(compiler.striders.totalBytesSize > 0);
            assert.ok(compiler.pTi.size > 0);
        });

        test('compile should handle wildcard role', () => {

            resourceInstance.AddResourceInstance('DOCUMENTS', 'doc_1');

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['*'],
                        action: ['READ'],
                        boundary: 'ALL',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['*'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('COMPILE_WILDCARD_ROLE', roleDefinition);
            compiler.compile();

            assert.ok(compiler.striders.totalBytesSize > 0);
            assert.ok(compiler.globalstriders[TYPE_IDS.COLLECTIONS]);
        });

        test('compile should handle role with TTL', () => {

            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            resourceInstance.AddResourceInstance('DOCUMENTS', 'doc_1');

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: ['READ'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['doc_1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: '1h'
                    }
                }
            };

            const compiler = new RoleCompiler('COMPILE_TTL_ROLE', roleDefinition);
            compiler.compile();

            assert.ok(compiler.striders.totalBytesSize > 0);
        });

        test('compile should handle duplicate Leaf for same parent instance', () => {

            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            resourceInstance.AddResourceInstance('DOCUMENTS', 'doc_1');
            resourceInstance.AddResourceInstance('DOCUMENTS', 'doc_2');

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: ['READ'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['doc_1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                },
                'member_2': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: ['WRITE'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['doc_2'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('COMPILE_MULTI_ROLE', roleDefinition);
            const cm=compiler.compile();

            assert.equal(cm.code,SYSTEM_STATUS.DUPLICATE_INSTANCE);
            console.log("+++",cm.code,cm.message);

            
        });
    });

    // ==========================================================================
    // TEST SUITE 8: Getters
    // ==========================================================================
    describe('Test 8: Getters', () => {
        let compiler;

        beforeEach(() => {

            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            resourceInstance.AddResourceInstance('DOCUMENTS', 'doc_1');

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: ['READ'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['doc_1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            compiler = new RoleCompiler('GETTER_TEST_ROLE', roleDefinition);
            compiler.compile();
        });

        test('getStriders should return striders', () => {
            const striders = compiler.getStriders();
            assert.ok(striders);
            assert.ok(striders.totalBytesSize > 0);
        });

        test('getStridersByParentPID should return striders for parent', () => {
            const striders = compiler.getStridersByParentPID(TYPE_IDS.COLLECTIONS);
            assert.ok(striders);
        });

        test('getStridersByParentInsPID should return striders for parent instance', () => {
            const parentIndex = resourceInstance.getResourceInstanceIndex('COLLECTIONS', 'users_collection');
            const striders = compiler.getStridersByParentInsPID(TYPE_IDS.COLLECTIONS, parentIndex);
            assert.ok(striders);
            assert.ok(striders.striderSize);
            assert.ok(striders.striderOffset);
        });

        test('getStridersByParentInsName should return striders', () => {
            const striders = compiler.getStridersByParentInsName('COLLECTIONS', 'users_collection');
            assert.ok(striders);
        });

        test('getPTI should return parent to instances map', () => {
            const pTi = compiler.getPTI();
            assert.ok(pTi instanceof Map);
            assert.ok(pTi.size > 0);
        });

        test('getSchemaSlice should return schema slices', () => {
            const slices = compiler.getSchemaSlice();
            assert.ok(slices instanceof Map);
            assert.ok(slices.size > 0);
        });

        test('getSchemaSliceByParentPID should return slices for parent', () => {
            const slices = compiler.getSchemaSliceByParentPID(TYPE_IDS.COLLECTIONS);
            assert.ok(slices);
        });

        test('getPathsBuffer should return paths buffer', () => {
            const buffer = compiler.getPathsBuffer();
            assert.ok(buffer);
            assert.ok(buffer.length > 0);
        });

        test('getChildCompactTree should return tree', () => {
            const tree = compiler.getChildCompactTree();
            assert.ok(tree instanceof Map);
            assert.ok(tree.size > 0);
        });

        test('getWildCardCompactTree should return tree', () => {
            const tree = compiler.getWildCardCompactTree();
            assert.ok(tree instanceof Map);
        });
    });

    // ==========================================================================
    // TEST SUITE 9: Performance Tests
    // ==========================================================================
    describe('Test 9: Performance', () => {
        test('compile should be fast for simple role (< 100ms)', () => {

            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            resourceInstance.AddResourceInstance('DOCUMENTS', 'doc_1');

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: ['READ'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['doc_1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('PERF_SIMPLE_ROLE', roleDefinition);
            const start = performance.now();
            compiler.compile();
            const duration = performance.now() - start;

            assert.ok(duration < 100, `Compile took ${duration}ms, expected < 100ms`);
        });

        test('compile should handle large role (< 500ms)', () => {

            
            // Create many instances
            for (let i = 0; i < 100; i++) {
                resourceInstance.AddResourceInstance('COLLECTIONS', `coll_${i}`);
                resourceInstance.AddResourceInstance('DOCUMENTS', `doc_${i}`);
            }

            const parentInstances = Array.from({ length: 100 }, (_, i) => `coll_${i}`);
            const ownerInstances = Array.from({ length: 100 }, (_, i) => `doc_${i}`);

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: parentInstances,
                        action: ['READ', 'WRITE'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ownerInstances,
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('PERF_LARGE_ROLE', roleDefinition);
            const start = performance.now();
            compiler.compile();
            const duration = performance.now() - start;

            assert.ok(duration < 500, `Compile took ${duration}ms, expected < 500ms`);
        });

        test('registerChildCompact should be O(1)', () => {

            const compiler = new RoleCompiler('PERF_COMPACT_ROLE', {});

            const start = performance.now();
            for (let i = 0; i < 1000; i++) {
                compiler.registerChildCompact(0, TYPE_IDS.DOCUMENTS, i);
            }
            const duration = performance.now() - start;

            assert.ok(duration < 50, `registerChildCompact took ${duration}ms for 1000 calls, expected < 50ms`);
        });
    });

    // ==========================================================================
    // TEST SUITE 10: Edge Cases
    // ==========================================================================
    describe('Test 10: Edge Cases', () => {
        test('should handle role with all actions', () => {

            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            resourceInstance.AddResourceInstance('DOCUMENTS', 'doc_1');

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: ['READ', 'WRITE', 'UPDATE', 'DELETE'],
                        boundary: 'ALL',
                        actionToOthers: ['READ', 'WRITE', 'UPDATE', 'DELETE'],
                        boundaryToOthers: 'ALL',
                        ownerInstance: ['doc_1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('ALL_ACTIONS_ROLE', roleDefinition);
            compiler.compile();

            assert.ok(compiler.striders.totalBytesSize > 0);
        });

        test('should handle role with multiple parent instances', () => {

            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            resourceInstance.AddResourceInstance('COLLECTIONS', 'products_collection');
            resourceInstance.AddResourceInstance('DOCUMENTS', 'doc_1');

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection', 'products_collection'],
                        action: ['READ'],
                        boundary: 'OWN',
                        actionToOthers: ['NONE'],
                        boundaryToOthers: 'NONE',
                        ownerInstance: ['doc_1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('MULTI_PARENT_ROLE', roleDefinition);
            compiler.compile();

            assert.ok(compiler.striders.totalBytesSize > 0);
            const pTi = compiler.pTi.get(TYPE_IDS.COLLECTIONS);
            assert.ok(pTi.instance.size === 2);
        });

        test('should handle empty role definition', () => {

            
            const compiler = new RoleCompiler('EMPTY_ROLE', {});
            const result = compiler.parsedGroupRoleValidation();
            assert.strictEqual(result, true);
        });

        test('should handle role with null leaf', () => {

            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
            resourceInstance.AddResourceInstance('DOCUMENTS', 'doc_1');

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': null
                }
            };

            const compiler = new RoleCompiler('NULL_LEAF_ROLE', roleDefinition);
            const result = compiler.parsedGroupRole();
            assert.strictEqual(result, true);
        });
    });
});