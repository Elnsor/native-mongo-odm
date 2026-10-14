import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { RoleBuilder } from '../rbac/builder/buildGroupRole.js'; 
import { TYPE_IDS, EFFECT_ACTION } from '../rbac/constant/resourceType.js';

describe('RoleBuilder', () => {
    let builder;

    beforeEach(() => {
        builder = new RoleBuilder();
    });

   
   /**
    * ### SUITE 1: Basic Construction & Scoping 
    * 
    * */ 
   
    describe('Basic Construction & Scoping', () => {
        it('should build a simple role with one member and one leaf', () => {
            const role = builder
                .addMember('role1')
                    .addLeaf('DOCUMENTS')
                        .setParent('COLLECTIONS', ['users'])
                        .setActions('RO')
                        .setOtherActions('NONE')
                        .addOwner('1')
                    .endLeaf()
                .endMember()
                .build();

            assert.ok(role.role1);
            assert.ok(role.role1.DOCUMENTS);
            assert.strictEqual(role.role1.DOCUMENTS.parentResource, 'COLLECTIONS');
            assert.deepStrictEqual(role.role1.DOCUMENTS.parentInstance, ['users']);
            assert.strictEqual(role.role1.DOCUMENTS.action, 'RO');
            assert.strictEqual(role.role1.DOCUMENTS.ownerInstance[0].name, '1');
        });

        it('should support multiple leaves under one member via endLeaf()', () => {
            const role = builder
                .addMember('admin')
                    .addLeaf('DOCUMENTS')
                        .setParent('COLLECTIONS', ['users'])
                        .setActions('RWO')
                        .addOwner('*')
                    .endLeaf()
                    .addLeaf('SEARCH_INDEXES')
                        .setParent('COLLECTIONS', ['users'])
                        .setActions('RO')
                        .addOwner('sear1')
                    .endLeaf()
                .endMember()
                .build();

            assert.ok(role.admin.DOCUMENTS);
            assert.ok(role.admin.SEARCH_INDEXES);
            assert.strictEqual(role.admin.SEARCH_INDEXES.ownerInstance[0].name, 'sear1');
        });

        it('should support multiple members in one role via endMember()', () => {
            const role = builder
                .addMember('admin')
                    .addLeaf('DOCUMENTS')
                        .setParent('COLLECTIONS', ['users'])
                        .setActions('RWUDA')
                        .addOwner('*')
                    .endLeaf()
                .endMember()
                .addMember('guest')
                    .addLeaf('DOCUMENTS')
                        .setParent('COLLECTIONS', ['public'])
                        .setActions('RO')
                        .addOwner('*')
                    .endLeaf()
                .endMember()
                .build();

            assert.ok(role.admin);
            assert.ok(role.guest);
            assert.strictEqual(role.guest.DOCUMENTS.parentInstance[0], 'public');
        });
    });

   
   /** 
    * 
    * ### SUITE 2: Actions & Owners
    * 
    * */ 
   
    describe('Actions & Owners', () => {
        it('should set default actions and actionToOthers', () => {
            const role = builder
                .addMember('role1')
                    .addLeaf('DOCUMENTS')
                        .setParent('COLLECTIONS', ['users'])
                        .setActions('RWO')
                        .setOtherActions('RA')
                        .addOwner('1')
                    .endLeaf()
                .endMember()
                .build();

            assert.strictEqual(role.role1.DOCUMENTS.action, 'RWO');
            assert.strictEqual(role.role1.DOCUMENTS.actionToOthers, 'RA');
        });

        it('should support per-owner TTL and action overrides', () => {
          
          /**
           * DOCUMENT Type not Allowed to have multipe instance 
           * it used her for test only 
           * when document type register in Rbac System Resource Instance the only instance i 0;
           */
            const role = builder
                .addMember('role1')
                    .addLeaf('DOCUMENTS')
                        .setParent('COLLECTIONS', ['users'])
                        .setActions('RO') // Default
                        .addOwner('doc1', { ttl: '1h' })
                        .addOwner('doc2', { ttl: '1d', action: 'RWO', actionToOthers: 'RA' })
                    .endLeaf()
                .endMember()
                .build();

            const owners = role.role1.DOCUMENTS.ownerInstance;
            assert.strictEqual(owners[0].name, 'doc1');
            assert.strictEqual(owners[0].ttl, '1h');
            assert.strictEqual(owners[0].EffectedAction, undefined); // Uses default
            
            assert.strictEqual(owners[1].name, 'doc2');
            assert.strictEqual(owners[1].ttl, '1d');
            assert.strictEqual(owners[1].EffectedAction, 'RWO');
            assert.strictEqual(owners[1].EffectedActionToOthers, 'RA');
        });

        it('should bulk add owners with addOwners()', () => {
            const role = builder
                .addMember('role1')
                    .addLeaf('DOCUMENTS')
                        .setParent('COLLECTIONS', ['users'])
                        .setActions('RO')
                        .addOwners(['doc1', 'doc2', 'doc3'], { ttl: '2h' })
                    .endLeaf()
                .endMember()
                .build();

            assert.strictEqual(role.role1.DOCUMENTS.ownerInstance.length, 3);
            assert.strictEqual(role.role1.DOCUMENTS.ownerInstance[2].ttl, '2h');
        });

        it('should replace owners with setOwners()', () => {
            builder
                .addMember('role1')
                    .addLeaf('DOCUMENTS')
                        .setParent('COLLECTIONS', ['users'])
                        .setActions('RO')
                        .addOwner('doc1');
            
            // Overwrite
            builder.setOwners(['doc2', 'doc3']);
            const role = builder.endLeaf().endMember().build();

            assert.strictEqual(role.role1.DOCUMENTS.ownerInstance.length, 2);
            assert.strictEqual(role.role1.DOCUMENTS.ownerInstance[0].name, 'doc2');
        });
    });

    /**
     * ### SUITE 3: Nested Resources (Hierarchy)
     * 
     */
    
    describe('Nested Resources (Hierarchy)', () => {
        it('should build valid nested hierarchy (Parent -> Nested -> Leaf)', () => {
            const role = builder
                .addMember('role1')
                    .addLeaf('FIELD_METRICS')
                        .setParent('COLLECTIONS', ['users'])
                        .setNested('SEARCH_INDEXES', ['sear1'])
                        .setActions('RO')
                        .addOwner('mat1')
                    .endLeaf()
                .endMember()
                .build();

            assert.strictEqual(role.role1.FIELD_METRICS.nested, 'SEARCH_INDEXES');
            assert.deepStrictEqual(role.role1.FIELD_METRICS.nestedInstance, ['sear1']);
        });

        it('should throw if nested resource is not a valid child of parent', () => {
            assert.throws(() => {
                builder
                    .addMember('role1')
                        .addLeaf('FIELD_METRICS')
                            .setParent('COLLECTIONS', ['users'])
                            .setNested('DOCUMENTS', ['doc1']) // Invalid: DOCUMENTS is sibling, not child of COLLECTIONS that leads to FIELD_METRICS
            }, /is not a valid child/);
        });

        it('should throw if leaf is not a valid child of nested resource', () => {
            assert.throws(() => {
                builder
                    .addMember('role1')
                        .addLeaf('DOCUMENTS')
                            .setParent('COLLECTIONS', ['users'])
                            .setNested('SEARCH_INDEXES', ['sear1']) // Invalid: DOCUMENTS is not child of SEARCH_INDEXES
            }, /Leaf "DOCUMENTS" is not a valid child of nested resource "SEARCH_INDEXES"/);
        });
    });

    
    /**
     *  SUITE 4: Wildcard Validation
     */
    
    describe('Wildcard Validation', () => {
        it('should allow wildcard "*" for parent instances', () => {
            const role = builder
                .addMember('role1')
                    .addLeaf('DOCUMENTS')
                        .setParent('COLLECTIONS', ['*'])
                        .setActions('RO')
                        .addOwner('*')
                    .endLeaf()
                .endMember()
                .build();

            assert.deepStrictEqual(role.role1.DOCUMENTS.parentInstance, ['*']);
        });

        it('should throw if wildcard "*" is mixed with specific parent instances', () => {
            assert.throws(() => {
                builder
                    .addMember('role1')
                        .addLeaf('DOCUMENTS')
                            .setParent('COLLECTIONS', ['users', '*'])
            }, /Wildcard "\*" cannot be mixed with specific instances/);
        });

        it('should throw if wildcard "*" is mixed with specific owners', () => {
            assert.throws(() => {
                builder
                    .addMember('role1')
                        .addLeaf('DOCUMENTS')
                            .setParent('COLLECTIONS', ['users'])
                            .setActions('RO')
                            .addOwners(['doc1', '*'])
            }, /Cannot add wildcard "\*" when specific owners exist/);
        });

        it('should throw if specific owners are added after wildcard "*"', () => {
            assert.throws(() => {
                builder
                    .addMember('role1')
                        .addLeaf('DOCUMENTS')
                            .setParent('COLLECTIONS', ['users'])
                            .setActions('RO')
                            .addOwner('*')
                            .addOwner('doc1') // Invalid
            }, /Cannot add specific owners after wildcard "\*" is set/);
        });
    });


    /**
     * SUITE 5: Error Handling & Edge Cases
     *  */ 

    describe('Error Handling & Edge Cases', () => {
        it('should throw if addLeaf is called before addMember', () => {
            assert.throws(() => builder.addLeaf('DOCUMENTS'), /Must call addMember\(\) before addLeaf\(\)/);
        });

        it('should throw if setParent is called before addLeaf', () => {
            assert.throws(() => {
                builder.addMember('role1').setParent('COLLECTIONS', ['users']);
            }, /Must call addLeaf\(\) first/);
        });

        it('should throw on invalid action notation', () => {
            assert.throws(() => {
                builder
                    .addMember('role1')
                        .addLeaf('DOCUMENTS')
                            .setParent('COLLECTIONS', ['users'])
                            .setActions('INVALID_ACTION')
            }, /Invalid action "INVALID_ACTION"/);
        });

        it('should throw on build if leaf is missing parent', () => {
            builder.addMember('role1').addLeaf('DOCUMENTS').setActions('RO').addOwner('doc1');
            assert.throws(() => builder.build(), /missing parentResource/);
        });

        it('should throw on build if leaf is missing owners', () => {
            builder.addMember('role1').addLeaf('DOCUMENTS').setParent('COLLECTIONS', ['users']).setActions('RO');
            assert.throws(() => builder.build(), /has no owners/);
        });

        it('should prevent duplicate member names', () => {
            builder.addMember('role1').endMember();
            assert.throws(() => builder.addMember('role1'), /Member "role1" already exists/);
        });

        it('should prevent duplicate leaf names under the same member', () => {
            assert.throws(() => {
                builder
                    .addMember('role1')
                        .addLeaf('DOCUMENTS')
                        .endLeaf()
                        .addLeaf('DOCUMENTS') // Duplicate
            }, /Leaf "DOCUMENTS" already exists for member "role1"/);
        });

        it('should throw if endLeaf is called without active leaf', () => {
            builder.addMember('role1');
            assert.throws(() => builder.endLeaf(), /No active leaf to end/);
        });

        it('should throw if endMember is called without active member', () => {
            assert.throws(() => builder.endMember(), /No active member to end/);
        });
    });

    /**
     * ###  SUITE 6: Utility Methods
     */
    describe('Utility Methods', () => {
        it('peek() should return a deep clone without affecting builder state', () => {
            builder.addMember('role1').addLeaf('DOCUMENTS').setParent('COLLECTIONS', ['users']).setActions('RO').addOwner('doc1');
            const peeked = builder.peek();
            
            assert.ok(peeked.role1);
            // Mutating peeked shouldn't affect builder
            peeked.role1.DOCUMENTS.action = 'CHANGED';
            
            const built = builder.endLeaf().endMember().build();
            assert.strictEqual(built.role1.DOCUMENTS.action, 'RO');
        });

        it('reset() should clear the builder state completely', () => {
            builder.addMember('role1').addLeaf('DOCUMENTS');
            builder.reset();
            
            // Should be able to add 'role1' again without throwing duplicate error
            assert.doesNotThrow(() => {
                builder
                    .addMember('role1')
                    .addLeaf('DOCUMENTS')
                    .setParent('COLLECTIONS', ['users'])
                    .setActions('RO')
                    .addOwner('*')
                    .endLeaf()
                    .endMember()
                    .build();
            });
        });
    });
});

console.log('✅ RoleBuilder test suite loaded. Run with: node --test role-builder.native.test.js');