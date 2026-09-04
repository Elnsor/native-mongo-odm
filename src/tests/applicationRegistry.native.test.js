import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { applicationSchemaRegistry } from '../framework/applicationSchemaRegistry.js';
import { AppError } from '../framework/appError.js';

describe('ApplicationSchemaRegistry', () => {
    
    let registeredCollections = [];

    /** example of dummy schema builder */
    const mockSchemaBuilder = {
        name: 'MockSchema',
        getProperties: () => ({ field1: { type: 'string' } }),
        getRequired: () => new Set(['field1'])
    };
/** example of another dummy schema builder */
    const anotherMockSchema = {
        name: 'AnotherMockSchema',
        getProperties: () => ({ field2: { type: 'number' } })
    };

    beforeEach(() => {
        
        registeredCollections = [];
    });

    afterEach(() => {
        /** reset register buckets */
        
        for (const name of registeredCollections) {
            try {
                applicationSchemaRegistry.unregister(name);
            } catch (e) {
                
            }
        }
        registeredCollections = [];
    });

    
    
    
    describe('register()', () => {
        test('should successfully register a new schema', () => {
            const collectionName = 'users';
            
            
            assert.doesNotThrow(() => {
                applicationSchemaRegistry.register(collectionName, mockSchemaBuilder);
            });
            
            registeredCollections.push(collectionName);
            
            
            assert.strictEqual(applicationSchemaRegistry.isRegister(collectionName), true);
        });

        test('should throw AppError with status 500 when registering duplicate schema', () => {
            const collectionName = 'products';
            
            
            applicationSchemaRegistry.register(collectionName, mockSchemaBuilder);
            registeredCollections.push(collectionName);
            
            
            assert.throws(
                () => applicationSchemaRegistry.register(collectionName, anotherMockSchema),
                (err) => {
                    assert.ok(err instanceof AppError);
                    assert.strictEqual(err.statusCode, 500);
                    assert.match(err.message, /already registered/);
                    return true;
                }
            );
        });

        test('should store the exact schema instance passed', () => {
            const collectionName = 'orders';
            applicationSchemaRegistry.register(collectionName, mockSchemaBuilder);
            registeredCollections.push(collectionName);
            
            const retrieved = applicationSchemaRegistry.getSchema(collectionName);
            assert.strictEqual(retrieved, mockSchemaBuilder); 
        });
    });

    
    
    
    describe('isRegister()', () => {
        test('should return true for registered schema', () => {
            const collectionName = 'users';
            applicationSchemaRegistry.register(collectionName, mockSchemaBuilder);
            registeredCollections.push(collectionName);
            
            assert.strictEqual(applicationSchemaRegistry.isRegister(collectionName), true);
        });

        test('should return false for non-registered schema', () => {
            assert.strictEqual(applicationSchemaRegistry.isRegister('non_existent_collection'), false);
        });

        test('should return false after unregistering a schema', () => {
            const collectionName = 'temp';
            applicationSchemaRegistry.register(collectionName, mockSchemaBuilder);
            applicationSchemaRegistry.unregister(collectionName);
            
            assert.strictEqual(applicationSchemaRegistry.isRegister(collectionName), false);
        });
    });

    
    
    
    describe('getSchema()', () => {
        test('should return the correct schema for registered collection', () => {
            const collectionName = 'users';
            applicationSchemaRegistry.register(collectionName, mockSchemaBuilder);
            registeredCollections.push(collectionName);
            
            const schema = applicationSchemaRegistry.getSchema(collectionName);
            assert.strictEqual(schema, mockSchemaBuilder);
            assert.strictEqual(schema.name, 'MockSchema');
        });

        test('should throw AppError with status 404 for non-registered collection', () => {
            assert.throws(
                () => applicationSchemaRegistry.getSchema('unknown_collection'),
                (err) => {
                    assert.ok(err instanceof AppError);
                    assert.strictEqual(err.statusCode, 404);
                    assert.match(err.message, /does not exist/);
                    return true;
                }
            );
        });

        test('should return different schemas for different collections', () => {
            applicationSchemaRegistry.register('users', mockSchemaBuilder);
            applicationSchemaRegistry.register('products', anotherMockSchema);
            registeredCollections.push('users', 'products');
            
            const userSchema = applicationSchemaRegistry.getSchema('users');
            const productSchema = applicationSchemaRegistry.getSchema('products');
            
            assert.strictEqual(userSchema.name, 'MockSchema');
            assert.strictEqual(productSchema.name, 'AnotherMockSchema');
            assert.notStrictEqual(userSchema, productSchema);
        });
    });

    
    
    
    describe('getAllSchema()', () => {
        test('should return an iterator over all registered schemas', () => {
            applicationSchemaRegistry.register('users', mockSchemaBuilder);
            applicationSchemaRegistry.register('products', anotherMockSchema);
            registeredCollections.push('users', 'products');
            
            const allSchemas = applicationSchemaRegistry.getAllSchema();
            
            
            assert.ok(typeof allSchemas[Symbol.iterator] === 'function');
            
            
            const entries = Array.from(allSchemas);
            assert.strictEqual(entries.length, 2);
        });

        test('should return entries in [collectionName, schemaInstance] format', () => {
            applicationSchemaRegistry.register('users', mockSchemaBuilder);
            registeredCollections.push('users');
            
            const entries = Array.from(applicationSchemaRegistry.getAllSchema());
            assert.strictEqual(entries.length, 1);
            
            const [name, schema] = entries[0];
            assert.strictEqual(name, 'users');
            assert.strictEqual(schema, mockSchemaBuilder);
        });

        test('should return empty iterator when no schemas registered', () => {
            const allSchemas = applicationSchemaRegistry.getAllSchema();
            const entries = Array.from(allSchemas);
            assert.strictEqual(entries.length, 0);
        });
    });

    
    
    
    describe('unregister()', () => {
        test('should successfully remove a registered schema', () => {
            const collectionName = 'users';
            applicationSchemaRegistry.register(collectionName, mockSchemaBuilder);
            
            assert.strictEqual(applicationSchemaRegistry.isRegister(collectionName), true);
            
            applicationSchemaRegistry.unregister(collectionName);
            
            assert.strictEqual(applicationSchemaRegistry.isRegister(collectionName), false);
        });

        test('should throw AppError when trying to get unregistered schema', () => {
            const collectionName = 'temp';
            applicationSchemaRegistry.register(collectionName, mockSchemaBuilder);
            applicationSchemaRegistry.unregister(collectionName);
            
            assert.throws(
                () => applicationSchemaRegistry.getSchema(collectionName),
                (err) => {
                    assert.ok(err instanceof AppError);
                    assert.strictEqual(err.statusCode, 404);
                    return true;
                }
            );
        });

        test('should allow re-registering after unregistering', () => {
            const collectionName = 'reusable';
            
            applicationSchemaRegistry.register(collectionName, mockSchemaBuilder);
            applicationSchemaRegistry.unregister(collectionName);
            
            
            assert.doesNotThrow(() => {
                applicationSchemaRegistry.register(collectionName, anotherMockSchema);
            });
            
            const schema = applicationSchemaRegistry.getSchema(collectionName);
            assert.strictEqual(schema, anotherMockSchema); 
            
            
            applicationSchemaRegistry.unregister(collectionName);
        });

        test('should not throw error when unregistering non-existent schema', () => {
            
            assert.doesNotThrow(() => {
                applicationSchemaRegistry.unregister('never_registered');
            });
        });
    });

    
    
    
    describe('Integration Scenarios', () => {
        test('should handle multiple schemas independently', () => {
            const collections = ['users', 'products', 'orders', 'reviews'];
            const schemas = [
                { name: 'UserSchema' },
                { name: 'ProductSchema' },
                { name: 'OrderSchema' },
                { name: 'ReviewSchema' }
            ];
            
            
            collections.forEach((name, i) => {
                applicationSchemaRegistry.register(name, schemas[i]);
                registeredCollections.push(name);
            });
            
            
            collections.forEach((name, i) => {
                assert.strictEqual(applicationSchemaRegistry.isRegister(name), true);
                assert.strictEqual(applicationSchemaRegistry.getSchema(name).name, schemas[i].name);
            });
            
            
            applicationSchemaRegistry.unregister('products');
            
            
            assert.strictEqual(applicationSchemaRegistry.isRegister('products'), false);
            assert.strictEqual(applicationSchemaRegistry.isRegister('users'), true);
            assert.strictEqual(applicationSchemaRegistry.isRegister('orders'), true);
            assert.strictEqual(applicationSchemaRegistry.isRegister('reviews'), true);
            
            
            registeredCollections = registeredCollections.filter(c => c !== 'products');
        });

        test('should maintain registry state across operations', () => {
            
            applicationSchemaRegistry.register('a', mockSchemaBuilder);
            registeredCollections.push('a');
            
            
            assert.strictEqual(applicationSchemaRegistry.isRegister('a'), true);
            
            
            applicationSchemaRegistry.register('b', anotherMockSchema);
            registeredCollections.push('b');
            
            
            const entries = Array.from(applicationSchemaRegistry.getAllSchema());
            assert.strictEqual(entries.length, 2);
            
            
            applicationSchemaRegistry.unregister('a');
            
            
            const newEntries = Array.from(applicationSchemaRegistry.getAllSchema());
            assert.strictEqual(newEntries.length, 1);
            assert.strictEqual(newEntries[0][0], 'b');
        });
    });
});