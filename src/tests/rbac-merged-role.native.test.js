import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { normalizeTTLToTimestamp } from '../rbac/utils/utils.js';

import { RoleCompiler } from '../rbac/compiler/schema-parser.js';
import { resourceInstance,  } from '../rbac/buckets/systemReourcesInstances.js';


resourceInstance.AddResourceInstance('COLLECTIONS',"users")
resourceInstance.AddResourceInstance('COLLECTIONS',"product")
resourceInstance.AddResourceInstance('COLLECTIONS',"orders")

// Replace global resourceInstance with mock
//global.resourceInstance = mockResourceInstance;

describe('explodeAndInvertRolesFinal - Comprehensive Tests', () => {

    beforeEach(()=>{
        resourceInstance.reset();
        resourceInstance.AddResourceInstance('COLLECTIONS',"users")
        resourceInstance.AddResourceInstance('COLLECTIONS',"product")
        resourceInstance.AddResourceInstance('COLLECTIONS',"orders")
    })
    
    describe('Phase 1: Basic Merging & Normalization', () => {
        
        it('should merge multiple role members with same parent/nested/owner', () => {
            const roles = {
                'role1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users'],
                        action: 'RO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['mat1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['sear1'],
                        ttl: '1d'
                    }
                },
                'role2': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users'],
                        action: 'WO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['mat1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['sear1'],
                        ttl: '2d'
                    }
                }
            };

            const ttl1=normalizeTTLToTimestamp("2d")
            
            const finalTtl=(ttl1 )

            const compiler = new RoleCompiler('TEST', roles);
            const result = compiler.explodeAndInvertRolesFinal(roles);

            
            const key = 'FIELD_METRICS|COLLECTIONS|users';
            assert.ok(result.has(key), 'Should have merged entry');
            
            const merged = result.get(key);
            assert.strictEqual(merged.nestedOwnersMap.length, 1, 'Should have 1 nested instance');
            
            const nestedEntry = merged.nestedOwnersMap[0];
            assert.strictEqual(nestedEntry.nestedInstance, 'sear1', 'Nested instance should be sear1');
            assert.strictEqual(nestedEntry.allowedOwners.length, 1, 'Should have 1 owner');
            
            const owner = nestedEntry.allowedOwners[0];
            assert.strictEqual(owner.name, 'mat1', 'Owner should be mat1');
            assert.strictEqual(owner.EffectedAction, 'RWO', 'Actions should merge to RWO');
            assert.strictEqual(owner.ttl, finalTtl, 'TTL should be max (2d)'); // Approximate
        });

        it('should handle multiple parent instances', () => {
            const roles = {
                'role1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users', 'product'],
                        action: 'RO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['mat1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['sear1'],
                        ttl: '1d'
                    }
                }
            };

            const compiler = new RoleCompiler('TEST', roles);
            const result = compiler.explodeAndInvertRolesFinal(roles);
            
            assert.ok(result.has('FIELD_METRICS|COLLECTIONS|users'), 'Should have users entry');
            assert.ok(result.has('FIELD_METRICS|COLLECTIONS|product'), 'Should have product entry');
        });

        it('should handle multiple nested instances', () => {
            const roles = {
                'role1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users'],
                        action: 'RO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['mat1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['sear1', 'sear2'],
                        ttl: '1d'
                    }
                }
            };

            const compiler = new RoleCompiler('TEST', roles);
            const result = compiler.explodeAndInvertRolesFinal(roles);
            
            const key = 'FIELD_METRICS|COLLECTIONS|users';
            const merged = result.get(key);
            
            assert.strictEqual(merged.nestedOwnersMap.length, 2, 'Should have 2 nested instances');
            assert.ok(merged.nestedOwnersMap.some(n => n.nestedInstance === 'sear1'), 'Should have sear1');
            assert.ok(merged.nestedOwnersMap.some(n => n.nestedInstance === 'sear2'), 'Should have sear2');
        });

        it('should handle multiple owner instances', () => {
            const roles = {
                'role1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users'],
                        action: 'RO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['mat1', 'mat2', 'mat3'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['sear1'],
                        ttl: '1d'
                    }
                }
            };

            const compiler = new RoleCompiler('TEST', roles);
            const result = compiler.explodeAndInvertRolesFinal(roles);
            
            const key = 'FIELD_METRICS|COLLECTIONS|users';
            const merged = result.get(key);
            const nestedEntry = merged.nestedOwnersMap[0];
            
            assert.strictEqual(nestedEntry.allowedOwners.length, 3, 'Should have 3 owners');
            assert.ok(nestedEntry.allowedOwners.some(o => o.name === 'mat1'), 'Should have mat1');
            assert.ok(nestedEntry.allowedOwners.some(o => o.name === 'mat2'), 'Should have mat2');
            assert.ok(nestedEntry.allowedOwners.some(o => o.name === 'mat3'), 'Should have mat3');
        });
    });

    describe('Phase 2: Owner Instance Wildcard Pruning', () => {
        
        it('should prune specific owners when wildcard owner exists with same action', () => {
            const roles = {
                'role1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users'],
                        action: 'RO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['*'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['sear1'],
                        ttl: '1d'
                    }
                },
                'role2': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users'],
                        action: 'RO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['mat1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['sear1'],
                        ttl: '1d'
                    }
                }
            };

            const compiler = new RoleCompiler('TEST', roles);
            const result = compiler.explodeAndInvertRolesFinal(roles);
            
            const key = 'FIELD_METRICS|COLLECTIONS|users';
            const merged = result.get(key);
            const nestedEntry = merged.nestedOwnersMap[0];
            
            assert.strictEqual(nestedEntry.allowedOwners.length, 1, 'Should have only 1 owner (wildcard)');
            assert.strictEqual(nestedEntry.allowedOwners[0].name, '*', 'Should keep wildcard');
        });

        it('should NOT prune specific owners when wildcard has LESS action', () => {
            const roles = {
                'role1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users'],
                        action: 'RO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['*'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['sear1'],
                        ttl: '1d'
                    }
                },
                'role2': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users'],
                        action: 'WO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['mat1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['sear1'],
                        ttl: '1d'
                    }
                }
            };

            const compiler = new RoleCompiler('TEST', roles);
            const result = compiler.explodeAndInvertRolesFinal(roles);
            
            const key = 'FIELD_METRICS|COLLECTIONS|users';
            const merged = result.get(key);
            const nestedEntry = merged.nestedOwnersMap[0];
            
            assert.strictEqual(nestedEntry.allowedOwners.length, 2, 'Should have 2 owners');
            assert.ok(nestedEntry.allowedOwners.some(o => o.name === '*'), 'Should have wildcard');
            assert.ok(nestedEntry.allowedOwners.some(o => o.name === 'mat1'), 'Should have mat1');
        });

        it('should prune when wildcard action is SUPERSET of specific action', () => {
            const roles = {
                'role1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users'],
                        action: 'RWO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['*'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['sear1'],
                        ttl: '1d'
                    }
                },
                'role2': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users'],
                        action: 'RO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['mat1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['sear1'],
                        ttl: '1d'
                    }
                }
            };

            const compiler = new RoleCompiler('TEST', roles);
            const result = compiler.explodeAndInvertRolesFinal(roles);
            
            const key = 'FIELD_METRICS|COLLECTIONS|users';
            const merged = result.get(key);
            const nestedEntry = merged.nestedOwnersMap[0];
            
            assert.strictEqual(nestedEntry.allowedOwners.length, 1, 'Should have only wildcard');
            assert.strictEqual(nestedEntry.allowedOwners[0].name, '*', 'Should keep wildcard');
        });
    });

    describe('Phase 3: Nested Instance Wildcard Pruning', () => {
        
        it('should prune specific nested instances when wildcard nested exists with same owner instance', () => {
            const roles = {
                'role1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users'],
                        action: 'RO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['mat1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['*'],
                        ttl: '1d'
                    }
                },
                'role2': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users'],
                        action: 'RO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['mat1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['sear1'],
                        ttl: '1d'
                    }
                }
            };

            const compiler = new RoleCompiler('TEST', roles);
            const result = compiler.explodeAndInvertRolesFinal(roles);
            
            const key = 'FIELD_METRICS|COLLECTIONS|users';
            const merged = result.get(key);
            
            assert.strictEqual(merged.nestedOwnersMap.length, 1, 'Should have only 1 nested instance');
            assert.strictEqual(merged.nestedOwnersMap[0].nestedInstance, '*', 'Should keep wildcard nested');
        });

        it('should NOT prune specific nested when wildcard has LESS action and with same owner instance', () => {
            const roles = {
                'role1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users'],
                        action: 'RO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['mat1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['*'],
                        ttl: '1d'
                    }
                },
                'role2': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users'],
                        action: 'WO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['mat1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['sear1'],
                        ttl: '1d'
                    }
                }
            };

            const compiler = new RoleCompiler('TEST', roles);
            const result = compiler.explodeAndInvertRolesFinal(roles);
            
            const key = 'FIELD_METRICS|COLLECTIONS|users';
            const merged = result.get(key);
            
            assert.strictEqual(merged.nestedOwnersMap.length, 2, 'Should have 2 nested instances');
        });

         it('should NOT prune specific nested when wildcard has set and with different owner instance even if both have same action', () => {
            const roles = {
                'role1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users'],
                        action: 'RO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['mat1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['*'],
                        ttl: '1d'
                    }
                },
                'role2': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users'],
                        action: 'RO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['mat2'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['sear1'],
                        ttl: '1d'
                    }
                }
            };

            const compiler = new RoleCompiler('TEST', roles);
            const result = compiler.explodeAndInvertRolesFinal(roles);
            
            const key = 'FIELD_METRICS|COLLECTIONS|users';
            const merged = result.get(key);
            
            assert.strictEqual(merged.nestedOwnersMap.length, 2, 'Should have 2 nested instances');
            assert.ok(merged.nestedOwnersMap.some(n=> n.nestedInstance === "*"),'should have wildcard nested instance')
            assert.ok(merged.nestedOwnersMap.some(n=> n.nestedInstance === "sear1"),'should have "sear1" nested instance')
            const nestWC=merged.nestedOwnersMap.find(n => n.nestedInstance === "*");
            const nestName=merged.nestedOwnersMap.find(n => n.nestedInstance === "sear1");
            assert.strictEqual(nestWC.allowedOwners.length,1)
            assert.strictEqual(nestWC.allowedOwners[0].name,"mat1")
            assert.strictEqual(nestName.allowedOwners.length,1)
            assert.strictEqual(nestName.allowedOwners[0].name,"mat2")
        });

        describe("WildCard Nested Insatance With Muliple Owner Insatnce",()=>{
             it('should  prune specific nested with same name owner instance and both have same action   ', () => {
            const roles = {
                'role1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users'],
                        action: 'RO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['mat1',"mat2"],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['*'],
                        ttl: '1d'
                    }
                },
                'role2': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users'],
                        action: 'RO',
                        actionToOthers: 'NONE',
                        ownerInstance: ["mat1",'mat2'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['sear1'],
                        ttl: '1d'
                    }
                }
            };

            const compiler = new RoleCompiler('TEST', roles);
            const result = compiler.explodeAndInvertRolesFinal(roles);
            
            const key = 'FIELD_METRICS|COLLECTIONS|users';
            const merged = result.get(key);
            
            assert.strictEqual(merged.nestedOwnersMap.length, 1, 'Should have 1 nested instances');
            assert.strictEqual(merged.nestedOwnersMap[0].nestedInstance,"*",'should have wildcard nested instance')
            assert.strictEqual(merged.nestedOwnersMap[0].allowedOwners.length,2);
            assert.ok(merged.nestedOwnersMap[0].allowedOwners.some(o=> o.name==="mat1"));
            assert.ok(merged.nestedOwnersMap[0].allowedOwners.some(o=> o.name==="mat2"));

        });

         it('should  prune specific nested with same  owner instance name and both have same action and keep (not prune ) different name owner instance   ', () => {
            const roles = {
                'role1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users'],
                        action: 'RO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['mat1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['*'],
                        ttl: '1d'
                    }
                },
                'role2': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users'],
                        action: 'RO',
                        actionToOthers: 'NONE',
                        ownerInstance: ["mat1",'mat2'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['sear1'],
                        ttl: '1d'
                    }
                }
            };

            const compiler = new RoleCompiler('TEST', roles);
            const result = compiler.explodeAndInvertRolesFinal(roles);
            
            const key = 'FIELD_METRICS|COLLECTIONS|users';
            const merged = result.get(key);
            
            assert.strictEqual(merged.nestedOwnersMap.length, 2, 'Should have 1 nested instances');
                      
            const nestWC=merged.nestedOwnersMap.find(n => n.nestedInstance === "*");
            const nestName=merged.nestedOwnersMap.find(n => n.nestedInstance === "sear1");
            assert.strictEqual(nestWC.allowedOwners.length,1)
            assert.strictEqual(nestWC.allowedOwners[0].name,"mat1")
            assert.strictEqual(nestName.allowedOwners.length,1)
            assert.strictEqual(nestName.allowedOwners[0].name,"mat2")

        });


        });
    });

    describe('Phase 4: Parent Instance Wildcard Absorption', () => {
        
        it('should absorb specific parent when wildcard parent exists with same action', () => {
            const roles = {
                'role1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['*'],
                        action: 'RO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['mat1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['sear1'],
                        ttl: '1d'
                    }
                },
                'role2': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users'],
                        action: 'RO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['mat1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['sear1'],
                        ttl: '1d'
                    }
                }
            };

            const compiler = new RoleCompiler('TEST', roles);
            const result = compiler.explodeAndInvertRolesFinal(roles);
            
            assert.ok(result.has('FIELD_METRICS|COLLECTIONS|*'), 'Should have wildcard parent');
            assert.ok(!result.has('FIELD_METRICS|COLLECTIONS|users'), 'Should NOT have specific parent');
        });

        it('should NOT absorb specific parent when wildcard has LESS action', () => {
            const roles = {
                'role1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['*'],
                        action: 'RO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['mat1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['sear1'],
                        ttl: '1d'
                    }
                },
                'role2': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users'],
                        action: 'WO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['mat1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['sear1'],
                        ttl: '1d'
                    }
                }
            };

            const compiler = new RoleCompiler('TEST', roles);
            const result = compiler.explodeAndInvertRolesFinal(roles);
            
            assert.ok(result.has('FIELD_METRICS|COLLECTIONS|*'), 'Should have wildcard parent');
            assert.ok(result.has('FIELD_METRICS|COLLECTIONS|users'), 'Should have specific parent');
        });
    });

    describe('TTL Merging Logic', () => {
        
        it('should use max TTL when merging owners', () => {
            const roles = {
                'role1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users'],
                        action: 'RO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['mat1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['sear1'],
                        ttl: '1h'
                    }
                },
                'role2': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users'],
                        action: 'RO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['mat1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['sear1'],
                        ttl: '1d'
                    }
                }
            };

            const compiler = new RoleCompiler('TEST', roles);
            const result = compiler.explodeAndInvertRolesFinal(roles);
            
            const key = 'FIELD_METRICS|COLLECTIONS|users';
            const merged = result.get(key);
            const owner = merged.nestedOwnersMap[0].allowedOwners[0];
            
            // 1d should be greater than 1h
            assert.ok(owner.ttl > 3600, 'TTL should be at least 1 day');
        });

        it('should use permanent (0) when one owner has permanent TTL', () => {
            const roles = {
                'role1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users'],
                        action: 'RO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['mat1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['sear1'],
                        ttl: 0  // Permanent
                    }
                },
                'role2': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users'],
                        action: 'RO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['mat1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['sear1'],
                        ttl: '1d'
                    }
                }
            };

            const compiler = new RoleCompiler('TEST', roles);
            const result = compiler.explodeAndInvertRolesFinal(roles);
            
            const key = 'FIELD_METRICS|COLLECTIONS|users';
            const merged = result.get(key);
            const owner = merged.nestedOwnersMap[0].allowedOwners[0];
            
            assert.strictEqual(owner.ttl, 0, 'TTL should be permanent (0)');
        });
    });

    describe('Action Merging Logic', () => {
        
        it('should merge actions using bitwise OR', () => {
            const roles = {
                'role1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users'],
                        action: 'RO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['mat1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['sear1'],
                        ttl: '1d'
                    }
                },
                'role2': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users'],
                        action: 'WO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['mat1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['sear1'],
                        ttl: '1d'
                    }
                },
                'role3': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users'],
                        action: 'UO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['mat1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['sear1'],
                        ttl: '1d'
                    }
                }
            };

            const compiler = new RoleCompiler('TEST', roles);
            const result = compiler.explodeAndInvertRolesFinal(roles);
            
            const key = 'FIELD_METRICS|COLLECTIONS|users';
            const merged = result.get(key);
            const owner = merged.nestedOwnersMap[0].allowedOwners[0];
            
            assert.strictEqual(owner.EffectedAction, 'RWUO', 'Should merge to RWUO');
        });

        it('should handle actionToOthers separately', () => {
            const roles = {
                'role1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users'],
                        action: 'RO',
                        actionToOthers: 'WO',
                        ownerInstance: ['mat1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['sear1'],
                        ttl: '1d'
                    }
                }
            };

            const compiler = new RoleCompiler('TEST', roles);
            const result = compiler.explodeAndInvertRolesFinal(roles);
            
            const key = 'FIELD_METRICS|COLLECTIONS|users';
            const merged = result.get(key);
            const owner = merged.nestedOwnersMap[0].allowedOwners[0];
            
            assert.strictEqual(owner.EffectedAction, 'RO', 'Primary action should be RO');
            assert.strictEqual(owner.EffectedActionToOthers, 'WO', 'Others action should be WO');
        });
    });

    describe('Direct (Non-Nested) Cases', () => {
        
        it('should handle direct owner instances without nested', () => {
            const roles = {
                'role1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users'],
                        action: 'RO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['mat1', 'mat2'],
                        nested: null,
                        nestedInstance: null,
                        ttl: '1d'
                    }
                }
            };

            const compiler = new RoleCompiler('TEST', roles);
            const result = compiler.explodeAndInvertRolesFinal(roles);
            
            const key = 'DOCUMENTS|COLLECTIONS|users';
            const merged = result.get(key);
            
            assert.strictEqual(merged.ownerInstance.length, 2, 'Should have 2 owners');
            assert.ok(merged.ownerInstance.some(o => o.name === 'mat1'), 'Should have mat1');
            assert.ok(merged.ownerInstance.some(o => o.name === 'mat2'), 'Should have mat2');
        });

        it('should prune direct owners with wildcard', () => {
            const roles = {
                'role1': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users'],
                        action: 'RO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['*'],
                        nested: null,
                        nestedInstance: null,
                        ttl: '1d'
                    }
                },
                'role2': {
                    'DOCUMENTS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users'],
                        action: 'RO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['mat1'],
                        nested: null,
                        nestedInstance: null,
                        ttl: '1d'
                    }
                }
            };

            const compiler = new RoleCompiler('TEST', roles);
            const result = compiler.explodeAndInvertRolesFinal(roles);
            
            const key = 'DOCUMENTS|COLLECTIONS|users';
            const merged = result.get(key);
            
            assert.strictEqual(merged.ownerInstance.length, 1, 'Should have only wildcard');
            assert.strictEqual(merged.ownerInstance[0].name, '*', 'Should be wildcard');
        });
    });

    describe('Edge Cases', () => {
        
        it('should handle empty ownerInstance array', () => {
            const roles = {
                'role1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users'],
                        action: 'RO',
                        actionToOthers: 'NONE',
                        ownerInstance: [],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['sear1'],
                        ttl: '1d'
                    }
                }
            };

            const compiler = new RoleCompiler('TEST', roles);
         
            const result = compiler.explodeAndInvertRolesFinal(roles);
            
            const key = 'FIELD_METRICS|COLLECTIONS|users';
            const merged = result.get(key);
            
            assert.strictEqual(merged.nestedOwnersMap[0].allowedOwners.length, 0, 'Should have 0 owners');
        });

        it('should handle null rule', () => {
            const roles = {
                'role1': {
                    'FIELD_METRICS': null
                }
            };

            const compiler = new RoleCompiler('TEST', roles);
            const result = compiler.explodeAndInvertRolesFinal(roles);
            
            assert.strictEqual(result.size, 0, 'Should have no entries');
        });

        it('should handle missing nestedInstance', () => {
            const roles = {
                'role1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users'],
                        action: 'RO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['mat1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: null,
                        ttl: '1d'
                    }
                }
            };

            const compiler = new RoleCompiler('TEST', roles);
            const result = compiler.explodeAndInvertRolesFinal(roles);
            
            const key = 'FIELD_METRICS|COLLECTIONS|users';
            const merged = result.get(key);
            
            assert.strictEqual(merged.nestedOwnersMap.length, 0, 'Should have 0 nested instances');
        });
    });

    describe('Complex Multi-Level Scenarios', () => {
        
        it('should handle wildcard at all levels (parent, nested, owner)', () => {
            const roles = {
                'role1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['*'],
                        action: 'RO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['*'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['*'],
                        ttl: '1d'
                    }
                },
                'role2': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users'],
                        action: 'RO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['mat1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['sear1'],
                        ttl: '1d'
                    }
                }
            };

            const compiler = new RoleCompiler('TEST', roles);
            const result = compiler.explodeAndInvertRolesFinal(roles);
            
            // Should only have wildcard parent
            assert.ok(result.has('FIELD_METRICS|COLLECTIONS|*'), 'Should have wildcard parent');
            assert.ok(!result.has('FIELD_METRICS|COLLECTIONS|users'), 'Should NOT have specific parent');
            
            const merged = result.get('FIELD_METRICS|COLLECTIONS|*');
            assert.strictEqual(merged.nestedOwnersMap.length, 1, 'Should have 1 nested instance');
            assert.strictEqual(merged.nestedOwnersMap[0].nestedInstance, '*', 'Should be wildcard nested');
            assert.strictEqual(merged.nestedOwnersMap[0].allowedOwners.length, 1, 'Should have 1 owner');
            assert.strictEqual(merged.nestedOwnersMap[0].allowedOwners[0].name, '*', 'Should be wildcard owner');
        });

        it('should handle mixed wildcards and specifics correctly', () => {
            const roles = {
                'role1': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users', 'product'],
                        action: 'RO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['mat1', 'mat2'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['sear1', 'sear2'],
                        ttl: '1d'
                    }
                },
                'role2': {
                    'FIELD_METRICS': {
                        parentResource: 'COLLECTIONS',
                        parentInstance: ['users'],
                        action: 'WO',
                        actionToOthers: 'NONE',
                        ownerInstance: ['mat1'],
                        nested: 'SEARCH_INDEXES',
                        nestedInstance: ['sear1'],
                        ttl: '2d'
                    }
                }
            };

            const compiler = new RoleCompiler('TEST', roles);
            const result = compiler.explodeAndInvertRolesFinal(roles);
            
            // Check users entry
            const usersKey = 'FIELD_METRICS|COLLECTIONS|users';
            assert.ok(result.has(usersKey), 'Should have users entry');
            const usersMerged = result.get(usersKey);
            
            // Should have 2 nested instances
            assert.strictEqual(usersMerged.nestedOwnersMap.length, 2, 'Should have 2 nested instances');
            
            // sear1 should have merged actions (RWO) and max TTL (2d)
            const sear1 = usersMerged.nestedOwnersMap.find(n => n.nestedInstance === 'sear1');
            assert.ok(sear1, 'Should have sear1');
            const mat1InSear1 = sear1.allowedOwners.find(o => o.name === 'mat1');
            assert.ok(mat1InSear1, 'Should have mat1 in sear1');
            assert.strictEqual(mat1InSear1.EffectedAction, 'RWO', 'Should merge to RWO');
            
            // sear2 should only have mat1 and mat2 with RO
            const sear2 = usersMerged.nestedOwnersMap.find(n => n.nestedInstance === 'sear2');
            assert.ok(sear2, 'Should have sear2');
            assert.strictEqual(sear2.allowedOwners.length, 2, 'Should have 2 owners in sear2');
            
            // Check product entry
            const productKey = 'FIELD_METRICS|COLLECTIONS|product';
            assert.ok(result.has(productKey), 'Should have product entry');
            const productMerged = result.get(productKey);
            assert.strictEqual(productMerged.nestedOwnersMap.length, 2, 'Should have 2 nested instances');
        });
    });
});