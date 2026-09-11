
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { RoleBuilder } from '../rbac/builder/buildGroupRole.js';

describe('RoleBuilder', () => {
    test('should build a valid role definition with fluent API', () => {
        const builder = new RoleBuilder();
        
        const roleDefinition = builder
            .addMember('admin_user')
            .addLeaf('DOCUMENTS')
            .setParent('COLLECTIONS', ['users_collection'])
            .setActions(['READ', 'WRITE', 'UPDATE'])
            .setBoundary('OWN')
            .setOtherActions(['READ'])
            .setOthersBoundary('ALL')
            .setOwnerInstances(['1'])
            .setTTL('1d')
            .build();

        assert.ok(roleDefinition['admin_user']);
        assert.ok(roleDefinition['admin_user']['DOCUMENTS']);
        
        const leafDef = roleDefinition['admin_user']['DOCUMENTS'];
        assert.strictEqual(leafDef.parentResource, 'COLLECTIONS');
        assert.deepStrictEqual(leafDef.parentInstance, ['users_collection']);
        assert.deepStrictEqual(leafDef.action, ['READ', 'WRITE', 'UPDATE']);
        assert.strictEqual(leafDef.boundary, 'OWN');
        assert.strictEqual(leafDef.ttl, '1d');
    });

    test('should throw error if addLeaf is called before addMember', () => {
        const builder = new RoleBuilder();
        assert.throws(
            () => builder.addLeaf('DOCUMENTS'),
            /Must add member first/
        );
    });
});