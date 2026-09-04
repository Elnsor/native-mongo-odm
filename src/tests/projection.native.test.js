/**
 * all method are static 
 * so we adopt in Map behaviar 
 * and how Projection handling different schema builder instances 
 */

import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Projection } from '../framework/engines/projectionEngine.js';

describe('Projection Engine', () => {
    
    
    const mockSchemaBuilder = {
        getProperties: () => ({
            username: { 
                mongoRoles: { bsonType: 'string' }, 
                appRoles: { select: true } 
            },
            password: { 
                mongoRoles: { bsonType: 'string' }, 
                appRoles: { select: false } 
            },
            email: { 
                mongoRoles: { bsonType: 'string' }, 
                appRoles: {} 
            },
            'accountInfo.salt': {
                mongoRoles: { bsonType: 'string' },
                appRoles: { select: false } 
            }
        })
    };

    
    beforeEach(() => {
        Projection.cache.clear();
    });

    afterEach(() => {
        Projection.cache.clear();
    });

    
    
    
    describe('addProjection()', () => {
        
        test('should correctly identify and cache fields with select: false', () => {
            const result = Projection.addProjection('users', mockSchemaBuilder);

            
            assert.deepStrictEqual(result, {
                password: 0,
                'accountInfo.salt': 0
            });

            
            assert.strictEqual(Projection.cache.has('users'), true);
            assert.strictEqual(Projection.cache.get('users'), result);
        });

        test('should return cached projection if called multiple times for same collection', () => {
            const firstCall = Projection.addProjection('products', mockSchemaBuilder);
            const secondCall = Projection.addProjection('products', mockSchemaBuilder);

            
            assert.strictEqual(firstCall, secondCall);
            
            
            assert.strictEqual(Projection.cache.size, 1);
        });

        test('should return empty object if schema has no properties', () => {
            const emptySchemaBuilder = {
                getProperties: () => ({})
            };

            const result = Projection.addProjection('empty_collection', emptySchemaBuilder);
            
            assert.deepStrictEqual(result, {});
            assert.strictEqual(Projection.cache.has('empty_collection'), true);
        });

        test('should return empty object if getProperties returns null or undefined', () => {
            const nullSchemaBuilder = {
                getProperties: () => null
            };

            const result = Projection.addProjection('null_collection', nullSchemaBuilder);
            
            assert.deepStrictEqual(result, {});
            
            
        });

        test('should handle fields without appRoles gracefully', () => {
            const schemaWithoutAppRoles = {
                getProperties: () => ({
                    field1: {}, 
                    field2: { appRoles: { select: false } }
                })
            };

            const result = Projection.addProjection('graceful_collection', schemaWithoutAppRoles);
            
            assert.deepStrictEqual(result, { field2: 0 });
        });
    });

    
    
    
    describe('getProjection()', () => {
        
        test('should retrieve existing projection from cache', () => {
            
            Projection.addProjection('orders', mockSchemaBuilder);
            
            
            const result = Projection.getProjection('orders');
            
            assert.deepStrictEqual(result, {
                password: 0,
                'accountInfo.salt': 0
            });
        });

        test('should return undefined for non-existent collection', () => {
            const result = Projection.getProjection('non_existent_collection');
            
            assert.strictEqual(result, undefined);
        });
    });

    
    
    
    describe('Integration Scenarios', () => {
        test('should manage multiple collections independently', () => {
            const schema1 = {
                getProperties: () => ({ secret1: { appRoles: { select: false } } })
            };
            const schema2 = {
                getProperties: () => ({ secret2: { appRoles: { select: false } } })
            };

            Projection.addProjection('coll1', schema1);
            Projection.addProjection('coll2', schema2);

            assert.strictEqual(Projection.cache.size, 2);
            assert.deepStrictEqual(Projection.getProjection('coll1'), { secret1: 0 });
            assert.deepStrictEqual(Projection.getProjection('coll2'), { secret2: 0 });
        });

        test('should allow re-evaluation after cache is cleared', () => {
            Projection.addProjection('temp', mockSchemaBuilder);
            assert.strictEqual(Projection.cache.size, 1);

            
            Projection.cache.clear();
            assert.strictEqual(Projection.cache.size, 0);

            
            const result = Projection.addProjection('temp', mockSchemaBuilder);
            assert.strictEqual(Projection.cache.size, 1);
            assert.deepStrictEqual(result, { password: 0, 'accountInfo.salt': 0 });
        });
    });
});