
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { resourceInstance } from '../rbac/buckets/systemReourcesInstances.js';
import { RoleCompiler } from '../rbac/compiler/schema-parser.js';
import { 
    TYPE_IDS, 
    SYSTEM_STATUS,
    SIZE_POWER,
    EFFECT_ACTION,
} from '../rbac/constant/resourceType.js';
import { rbacManager } from '../rbac/rbacManager.js';

/**
 * update this test file to be align wiht new updated
 * its not cover all casses her 
 * ttl cases and expiration are in its own test file 
 * merged and explode roles are in its own  test file 
 */

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
                        action: "RO",
                        actionToOthers:'NONE',
                        ownerInstance: ['1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('TEST_ROLE', roleDefinition);
            compiler.compile();

            assert.strictEqual(compiler.groupRoleName, 'TEST_ROLE');
            assert.ok(compiler.striders);
            assert.ok(compiler.schemaInsance);
            assert.ok(compiler.globalstriders);
            assert.ok(compiler.childCompactTree instanceof Map);
            assert.ok(compiler.wildcardCompactTree instanceof Map);
            assert.ok(compiler.nestedChildCompactoffsetTree instanceof Map);
            assert.ok(compiler.nestedGrandChildCompactTree)
            assert.ok(compiler.pTi instanceof Map);
            assert.ok(compiler.schemaSlices instanceof Map);
            assert.ok(compiler.memberTableMap instanceof Map);
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

        test('should read new Effected Action Notation  correctly', () => {
            const effects = EFFECT_ACTION["RWO"]
            
            // READ = 1, WRITE = 2, OWN = 16
            // Expected: 1 | 2 | 16 = 19
            assert.strictEqual(effects, 19);
        });

        test('should handle single action', () => {
            const effects = compiler.geteffectedActionBoundary(['READ'], 'OWN');
            // READ = 1, OWN = 16
            assert.strictEqual(effects, 17);
        });

        test('should handle all actions in new Action Notation', () => {
           const effects=EFFECT_ACTION['RWUDA'];
            // 1 | 2 | 4 | 8 | 64 = 79
            assert.strictEqual(effects, 79);
        });

        test('should handle NONE actions in new Action Notation', () => {
              const effects=EFFECT_ACTION['NONE'];
            // READ = 1, NONE = 0
            assert.strictEqual(effects, 0);
        });

        test('should handle LIMITED boundary', () => {
              const effects=EFFECT_ACTION['RL'];
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

        test('registerChildCompact should create new compact index using new 2 level nested map  ', () => {
            const compact = compiler.register2KeyChildCompact(0, TYPE_IDS.DOCUMENTS, 0);
            assert.strictEqual(compact, 0);
        });

        test('registerChildCompact should increment for different children', () => {
            const compact1 = compiler.register2KeyChildCompact(0, TYPE_IDS.DOCUMENTS, 0);
            const compact2 = compiler.register2KeyChildCompact(0, TYPE_IDS.DOCUMENTS, 1);
            const compact3 = compiler.register2KeyChildCompact(0, TYPE_IDS.DOCUMENTS, 2);

            assert.strictEqual(compact1, 0);
            assert.strictEqual(compact2, 1);
            assert.strictEqual(compact3, 2);
        });

        test('register2KeyChildCompact should return existing compact for duplicate', () => {
            const compact1 = compiler.register2KeyChildCompact(0, TYPE_IDS.DOCUMENTS, 0);
            const compact2 = compiler.register2KeyChildCompact(0, TYPE_IDS.DOCUMENTS, 0);

            assert.strictEqual(compact1, compact2);
        });

        test('register2KeyChildCompact should handle different parent globals', () => {
            const compact1 = compiler.registerChildCompact(0, TYPE_IDS.DOCUMENTS, 0);
            const compact2 = compiler.registerChildCompact(1, TYPE_IDS.DOCUMENTS, 0);

            assert.strictEqual(compact1, 0);
            assert.strictEqual(compact2, 0); // Different parent, new tree
        });

        test('register2KeyChildCompact should handle different child types', () => {
            const compact1 = compiler.register2KeyChildCompact(0, TYPE_IDS.DOCUMENTS, 0);
            const compact2 = compiler.register2KeyChildCompact(0, TYPE_IDS.SEARCH_INDEXES, 0);

            assert.strictEqual(compact1, 0);
            assert.strictEqual(compact2, 0); // Different child type
        });

        test('registerWildCardCompact should create new compact index', () => {
            const compact = compiler.registerWildCardCompact(TYPE_IDS.COLLECTIONS, TYPE_IDS.DOCUMENTS, 0);
            assert.strictEqual(compact, 0);
        });

        test('get2KeyChildCompact should return compact index', () => {
            compiler.register2KeyChildCompact(0, TYPE_IDS.DOCUMENTS, 0);
            const compact = compiler.get2KeyChildCompact(0, TYPE_IDS.DOCUMENTS, 0);
            assert.strictEqual(compact, 0);
        });

        test('get2KeyChildCompact should return -1 for non-existent', () => {
            const compact = compiler.get2KeyChildCompact(999, TYPE_IDS.DOCUMENTS, 0);
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
    // TEST SUITE 4: groupRoleValidationSchema
    // ==========================================================================
    describe('Test 4: groupRoleValidationSchema()', () => {
        beforeEach(()=>{
             rbacManager.reset();
            rbacManager.registerResource([{
                "COLLECTIONS":['users_collection'],
            }])

        })
        test('should return true for valid role definition', () => {

            rbacManager.reset();
            rbacManager.registerResource([{
                "COLLECTIONS":['users_collection'],
            }])


            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: "RO",
                        actionToOthers:'NONE',
                        ownerInstance: ['1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('VALID_ROLE', roleDefinition);
            const result = compiler.groupRoleValidationSchema();
            assert.strictEqual(result, true);
        });

        test('should return error for invalid parent resource', () => {

            rbacManager.reset();
            rbacManager.registerResource([{
                "COLLECTIONS":['users_collection'],
            }])


            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'INVALID_RESOURCE',
                        parentInstance: ['users_collection'],
                         action: "RO",
                        actionToOthers:'NONE',
                        ownerInstance: ['1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('INVALID_PARENT_ROLE', roleDefinition);
            const result = compiler.groupRoleValidationSchema();
            assert.strictEqual(result.code, SYSTEM_STATUS.INVALID_RESOURCE_PID);
        });

        test('should return error for empty parent instance list', () => {

               rbacManager.reset();
            rbacManager.registerResource([{
                "COLLECTIONS":['users_collection'],
            }])


            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: [],
                        action: "RO",
                        actionToOthers:'NONE',
                        ownerInstance: ['1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('EMPTY_PARENT_ROLE', roleDefinition);
            const result = compiler.groupRoleValidationSchema()
            assert.strictEqual(result.code, SYSTEM_STATUS.RESOURCES_EMPTY_LIST);
        });

        test('should return error for wildcard mixed with other instances', () => {

           
            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['*', 'users_collection'],
                         action: "RO",
                        actionToOthers:'NONE',
                        ownerInstance: ['1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('WILDCARD_MIX_ROLE', roleDefinition);
            const result = compiler.groupRoleValidationSchema();
            assert.strictEqual(result.code,SYSTEM_STATUS.INVALID_SCHEMA);
        });

        test('should return error for invalid hierarchy', () => {

       

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'USERS', // DOCUMENTS is not child of USERS
                        parentInstance: ['users_collection'],
                        action: "RO",
                        actionToOthers:'NONE',
                        ownerInstance: ['1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('INVALID_HIERARCHY_ROLE', roleDefinition);
            const result = compiler.groupRoleValidationSchema();
            assert.strictEqual(result.code, SYSTEM_STATUS.INVALID_SCHEMA);
        });

        test('should validate nested role correctly', () => {
             rbacManager.reset();
            rbacManager.registerResource({
                "COLLECTIONS": ['users_collection'],
                'SEARCH_INDEXES': ['idx_1'],
                'FIELD_METRICS': ['metric_1'],
            })

            const roleDefinition = {
                'member_1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: "RO",
                        actionToOthers:'NONE',
                        ownerInstance: ['metric_1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['idx_1'],
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('VALID_NESTED_ROLE', roleDefinition);
            const result = compiler.groupRoleValidationSchema();
            assert.strictEqual(result, true);
        });

        test('should return error for invalid nested hierarchy', () => {

           rbacManager.reset();
            rbacManager.registerResource({
                "COLLECTIONS": ['users_collection'],
                'SEARCH_INDEXES': ['idx_1'],
                'FIELD_METRICS': ['metric_1'],
            })


            const roleDefinition = {
                'member_1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: "RO",
                        actionToOthers:'NONE',
                        ownerInstance: ['metric_1'],
                        nested: 'DOCUMENTS', // FIELD_METRICS is not child of DOCUMENTS
                        nestedInstance: ['idx_1'],
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('INVALID_NESTED_ROLE', roleDefinition);
            const result = compiler.groupRoleValidationSchema();
            assert.strictEqual(result.code, SYSTEM_STATUS.INVALID_SCHEMA);
        });
    });

    // ==========================================================================
    // TEST SUITE 5:  usedMemberMergedRoles(); 
    // -Phase 1: (Merged Phase (Phase 1: Structural Inversion & Smart Pruning) its have its own test file 
    //-Phase  2: Member Aggregation & Partitioning
    //Phase 3: Compact Indexing & Buffer Staging (thats done in Test 3 above)
    // ==========================================================================
    describe('Test 5: usedMemberMergedRoles', () => {
         beforeEach(()=>{
             rbacManager.reset();
            rbacManager.bulkRegisterResources({
                "COLLECTIONS":['users_collection'],
            })

        });
        test('should parse simple role and populate pTi', () => {

           
        
            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: "RO",
                        actionToOthers:'NONE',
                        ownerInstance: ['1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('PARSE_SIMPLE_ROLE', roleDefinition);
            const result = compiler.usedMemberMergedRoles();
            assert.strictEqual(result, true);

            // Verify pTi is populated
            assert.ok(compiler.pTi.has(TYPE_IDS.COLLECTIONS));
            const instances = compiler.pTi.get(TYPE_IDS.COLLECTIONS).instance;
            assert.ok(instances.size > 0);
        });

        test('should parse nested role and populate pTi', () => {
            rbacManager.registerResource("SEARCH_INDEXES",['idx_1'])
            rbacManager.registerResource("FIELD_METRICS",['metric_1'])

          
            const roleDefinition = {
                'member_1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: "RO",
                        actionToOthers:'NONE',
                        ownerInstance: ['metric_1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['idx_1'],
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('PARSE_NESTED_ROLE', roleDefinition);
            const result = compiler.compile();
            assert.strictEqual(result, true);

            // Verify pTi is populated
            assert.ok(compiler.pTi.has(TYPE_IDS.COLLECTIONS));
        });

        test('should populate childCompactTree', () => {

          
            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: "RO",
                        actionToOthers:'NONE',
                        ownerInstance: ['1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('COMPACT_TREE_ROLE', roleDefinition);
            compiler.compile();

            assert.ok(compiler.childCompactTree.size > 0);
        });

        test('should populate wildcardCompactTree for wildcard roles', () => {

           

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['*'],
                          action: "RO",
                        actionToOthers:'NONE',
                        ownerInstance: ['1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('WILDCARD_TREE_ROLE', roleDefinition);
            compiler.compile();

            assert.ok(compiler.wildcardCompactTree.size > 0);
        });

        test('should populate pathsBuffer', () => {

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: "RO",
                        actionToOthers:'NONE',
                        ownerInstance: ['1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('PATHS_BUFFER_ROLE', roleDefinition);
            compiler.usedMemberMergedRoles();

            assert.ok(compiler._pathsBufferInstanceCounts > 0);
        });

        test('should handle one original Role member translate to one distinct member based one parent type and instance  after merged and prune phase (one instance)', () => {

   

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: "RO",
                        actionToOthers:'NONE',
                        ownerInstance: ['1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('MEMBER_REGISTER_ROLE', roleDefinition);
            compiler.compile();

            const memberName = 'member-100-0';
            const memberId=0;
            assert.ok(compiler.memberTableMap.size>0);
            assert.equal(memberName,compiler.getRoleMemberNameById(memberId));
        });

      test('should handle multiple parent Insatnce in original one Role members for same parent Type  translate to multiple distinct members  based on its insatnce index after merged and prune phase (2 instances)', () => {

                 resourceInstance.AddResourceInstance("COLLECTIONS",'products');

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection','products'],
                        action: "RO",
                        actionToOthers:'NONE',
                        ownerInstance: ['1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('MEMBER_REGISTER_ROLE', roleDefinition);
            compiler.usedMemberMergedRoles();

            const memberName = 'member-100-0';
            const memberName1 = 'member-100-1';
            const memberId=0;
            const memberId1=1;
            assert.ok(compiler.memberTableMap.size>0);
            assert.equal(memberName,compiler.getRoleMemberNameById(memberId));
            assert.equal(memberName1,compiler.getRoleMemberNameById(memberId1));
        });

         test('should handle multiple parent Insatnce in multiple original Role members for same parent Type  translate to multiple distinct member  based on its insatnce index after merged and prune phase', () => {

                 resourceInstance.AddResourceInstance("COLLECTIONS",'products');

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection','products'],
                        action: "RO",
                        actionToOthers:'NONE',
                        ownerInstance: ['1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                },
                'member_2': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['products'],
                        action: "RO",
                        actionToOthers:'NONE',
                        ownerInstance: ['1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('MEMBER_REGISTER_ROLE', roleDefinition);
            compiler.usedMemberMergedRoles();

            const memberName = 'member-100-0';
            const memberName1 = 'member-100-1';
            const memberId=0;
            const memberId1=1;
            assert.ok(compiler.memberTableMap.size>0);
            assert.equal(memberName,compiler.getRoleMemberNameById(memberId));
            assert.equal(memberName1,compiler.getRoleMemberNameById(memberId1));
        });

        test('should handle multiple original Role members for same parent translate to one distinct member after merged and prune phase', () => {

            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
         

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: "RO",
                        actionToOthers:'NONE',
                        ownerInstance: ['1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                },
                'member_2': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: "WO",
                        actionToOthers:'NONE',
                        ownerInstance: ['1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('MULTI_MEMBER_ROLE', roleDefinition);
            const result = compiler.usedMemberMergedRoles();
            assert.strictEqual(result, true);

             const memberName = 'member-100-0';
             assert.ok(compiler.memberTableMap.size === 1);
             assert.equal(memberName,compiler.getRoleMemberNameById(0));
            
        });
    });

    // ==========================================================================
    // TEST SUITE 6: Striders Calculation
    // ==========================================================================
    describe('Test 6: Striders Calculation', () => {
        test('calculateTotalStridersSchemaSlice should calculate striders', () => {

            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
           

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: "RO",
                        actionToOthers:'NONE',
                        ownerInstance: ['1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('STRIDER_CALC_ROLE', roleDefinition);
            compiler.groupRoleValidationSchema();
            compiler.usedMemberMergedRoles();
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
                        action: "RO",
                        actionToOthers:'NONE',
                        ownerInstance: ['1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('STRIDER_STRUCT_ROLE', roleDefinition);
            compiler.groupRoleValidationSchema();
            compiler.usedMemberMergedRoles();
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
                       action: "RO",
                        actionToOthers:'NONE',
                      
                        ownerInstance: ['*'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('GLOBAL_STRIDER_ROLE', roleDefinition);
            compiler.groupRoleValidationSchema();
            compiler.usedMemberMergedRoles();
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
                         action: "RO",
                        actionToOthers:'NONE',
                        ownerInstance: ['metric_1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['idx_1'],
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('NESTED_STRIDER_ROLE', roleDefinition);
            compiler.compile()

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
         
            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                          action: "RO",
                        actionToOthers:'NONE',
                        ownerInstance: ['1'],
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

            

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'INVALID_RESOURCE',
                        parentInstance: ['users_collection'],
                         action: "RO",
                        actionToOthers:'NONE',
                        ownerInstance: ['1'],
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
                          action: "RUO",
                        actionToOthers:'RA',
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
                          action: "RO",
                        actionToOthers:'NONE',
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
           

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                         action: "RO",
                        actionToOthers:'NONE',
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

        test('compile should handle merged duplicate Leaf for same parent instance into same member with same leaf ', () => {

            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
          

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                        action: "RO",
                        actionToOthers:'NONE',
                        ownerInstance: ['1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                },
                'member_2': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                          action: "WO",
                        actionToOthers:'NONE',
                        ownerInstance: ['doc_2'],
                        nested: null,
                        nestedInstance: null,
                        ttl: null
                    }
                }
            };

            const compiler = new RoleCompiler('COMPILE_MULTI_ROLE', roleDefinition);
            const cm=compiler.compile();

            assert.equal(compiler.memberTableMap.size,1);
           

            
        });
    });

    // ==========================================================================
    // TEST SUITE 8: Getters
    // ==========================================================================
    describe('Test 8: Getters', () => {
        let compiler;

        beforeEach(() => {

            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
          

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                          action: "RO",
                        actionToOthers:'NONE',
                        ownerInstance: ['1'],
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
          

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                         action: "RO",
                        actionToOthers:'NONE',
                        ownerInstance: ['1'],
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
               
            }

            const parentInstances = Array.from({ length: 100 }, (_, i) => `coll_${i}`);
            const ownerInstances = Array.from({ length: 100 }, (_, i) => `doc_${i}`);

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: parentInstances,
                           action: "RO",
                        actionToOthers:'NONE',
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
           
            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection'],
                         action: "RWUDA",
                        actionToOthers:'RWUDA',
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
            

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users_collection', 'products_collection'],
                          action: "RO",
                        actionToOthers:'NONE',
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

        test('should return error code for empty role definition when create fresh role', () => {

            
            const compiler = new RoleCompiler('EMPTY_ROLE', {});
            const result = compiler.groupRoleValidationSchema();
            assert.strictEqual(result.code, SYSTEM_STATUS.VALIDATION_SCHEMA_FAILED);
        });

        test('should handle role with null leaf', () => {

            resourceInstance.AddResourceInstance('COLLECTIONS', 'users_collection');
         

            const roleDefinition = {
                'member_1': {
                    'DOCUMENTS': null
                }
            };

            const compiler = new RoleCompiler('NULL_LEAF_ROLE', roleDefinition);
            const result = compiler.groupRoleValidationSchema();
            assert.strictEqual(result.code, SYSTEM_STATUS.VALIDATION_SCHEMA_FAILED);
        });
    });
});