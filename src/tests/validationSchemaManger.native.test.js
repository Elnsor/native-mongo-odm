
/**
 * apply test for new updated for this class 
 * date : 20-9-2026
 */
import { describe, test, beforeEach, afterEach, mock, it } from 'node:test';
import assert from 'node:assert/strict';
import { schemaManager } from '../validation/schemaManager.js';
import { SchemaBuilder } from '../framework/SchemaBuilder.js';
import { applicationSchemaRegistry } from '../framework/applicationSchemaRegistry.js';
import { collectionManager } from '../framework/CollectionManager.js';
import { frameworkConfig } from '../config/frameworkConfig.js';
import { AppError } from '../framework/appError.js';

describe('SchemaValidationMananger (schemaManager)', () => {
  
  beforeEach(() => {
    // Reset state before each test
    schemaManager.schemaCache = {};
    applicationSchemaRegistry.registry.clear();
    // Ensure we test the registry path by default
    frameworkConfig.schemaDefaults.autoLoadingRegisterSchema = true;
  });

  afterEach(() => {
    mock.restoreAll();
  });

  // ==========================================================================
  // 1. SCHEMA LOADING & CACHING
  // ==========================================================================
  describe('Schema Loading', () => {
    test('should load schema from applicationSchemaRegistry and pre-calculate flags', async () => {
      const builder = new SchemaBuilder('test_users')
        .object({ name: 'accountInfo' })
        .string({ name: 'accountInfo.email', config: { required: true } })
        .string({ name: 'username', config: { required: true } });
      
      applicationSchemaRegistry.register('test_users', builder);

      const schema = await schemaManager.getSchema('test_users');

      assert.ok(schema.required.has('accountInfo.email'));
      assert.ok(schema.required.has('username'));
      assert.ok(schema.validSchemaKeys.has('accountInfo.email'));
      
      // The core optimization: parent should be flagged as having nested children
      assert.strictEqual(schema.properties.accountInfo.appRoles.hasNestedChildren, true);
      assert.strictEqual(schema.properties.username.appRoles.hasNestedChildren, false);
    });

    test('should load schema from MongoDB collection options when registry is disabled', async () => {
      frameworkConfig.schemaDefaults.autoLoadingRegisterSchema = false;

      const mockCollection = {
        options: mock.fn(async () => ({
          validator: {
            $jsonSchema: {
              required: ['email'],
              properties: {
                email: { bsonType: 'string' },
                profile: { bsonType: 'object'},              
               'profile.age': { bsonType: 'int' } ,// Simulating dot notation in DB schema
                },
              }
            }
        }))
      };

      const getCollectionMock = mock.method(collectionManager, 'getCollection', async () => mockCollection);

      const schema =  await schemaManager.getSchema('db_users');
      

      assert.ok(getCollectionMock.mock.calls.length === 1);
      assert.strictEqual(schema.properties.profile.appRoles.hasNestedChildren, true);
      assert.ok(schema.validSchemaKeys.has('profile.age'));
    });

     it("should correctly compute 'hasNestedChildren' flag in loadRegisterdSchema", () => {
            const builder = new SchemaBuilder("testCollection")
                .object({ name: "accountInfo", config: { nullable: false } })
                .string({ name: "accountInfo.email", config: { required: true } })
                .string({ name: "username", config: { required: true } });
            
            applicationSchemaRegistry.register("testCollection", builder);
            
            // Access internal method to test parity
            const schema = schemaManager.loadRegisterdSchema("testCollection");
            
            assert.strictEqual(schema.properties["accountInfo"].appRoles.hasNestedChildren, true);
            assert.strictEqual(schema.properties["accountInfo.email"].appRoles.hasNestedChildren, false);
            assert.strictEqual(schema.properties["username"].appRoles.hasNestedChildren, false);
        });

    test('should throw 403 if collection has no schema properties', async () => {
      frameworkConfig.schemaDefaults.autoLoadingRegisterSchema = false;
      const mockCollection = { options: mock.fn(async () => ({})) };
      mock.method(collectionManager, 'getCollection', async () => mockCollection);

      await assert.rejects(
        async () => await schemaManager.getSchema('no_schema_collection'),
        (err) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual(err.statusCode, 403);
          assert.match(err.message, /has no defined validation schema layout/);
          return true;
        }
      );
    });
  });

  // ==========================================================================
  // 2. VALUE FORMATTING & TYPE CASTING
  // ==========================================================================
  describe('formatValue', () => {
    test('should trim and validate strings', () => {
      const result = schemaManager.formatValue('username', 'users', 'string', '  john_doe  ', { minLength: 3 });
      assert.strictEqual(result, 'john_doe');
    });

    test('should reject strings failing regex pattern', () => {
      assert.throws(
        () => schemaManager.formatValue('email', 'users', 'string', 'invalid-email', { pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' }),
        /not valid format/
      );
    });

    test('should cast and validate numbers (int/double)', () => {
      assert.strictEqual(schemaManager.formatValue('age', 'users', 'int', '25', { minimum: 18 }), 25);
      assert.strictEqual(schemaManager.formatValue('price', 'users', 'double', '19.99', { maximum: 100 }), 19.99);
      
      assert.throws(
        () => schemaManager.formatValue('age', 'users', 'int', '15', { minimum: 18 }),
        /less than minimim expected/
      );
    });

    test('should coerce booleans correctly', () => {
      assert.strictEqual(schemaManager.formatValue('isActive', 'users', 'bool', 'true'), true);
      assert.strictEqual(schemaManager.formatValue('isActive', 'users', 'bool', 0), false);
      assert.throws(
        () => schemaManager.formatValue('isActive', 'users', 'bool', 'maybe'),
        /must be valid boolean/
      );
    });

    test('should parse dates', () => {
      const result = schemaManager.formatValue('createdAt', 'users', 'date', '2023-10-25T10:00:00Z');
      assert.ok(result instanceof Date);
      assert.strictEqual(result.getTime(), new Date('2023-10-25T10:00:00Z').getTime());
    });

    test('should validate plain objects and reject arrays/null', () => {
      assert.deepStrictEqual(schemaManager.formatValue('meta', 'users', 'object', { a: 1 }), { a: 1 });
      
      assert.throws(() => schemaManager.formatValue('meta', 'users', 'object', null), /must be a valid plain Object/);
      assert.throws(() => schemaManager.formatValue('meta', 'users', 'object', [1, 2]), /must be a valid plain Object/);
    });

    test('should validate arrays with constraints', () => {
      const result = schemaManager.formatValue('tags', 'users', 'array', ['a', 'b'], { minItems: 1, maxItems: 5, uniqueItems: true });
      assert.deepStrictEqual(result, ['a', 'b']);

      assert.throws(
        () => schemaManager.formatValue('tags', 'users', 'array', ['a', 'a'], { uniqueItems: true }),
        /must contain unique items/
      );
    });
  });

  // ==========================================================================
  // 3. HELPER METHODS
  // ==========================================================================
  describe('Nested Helpers', () => {
    test('_getNestedValue should retrieve deep values', () => {
      const obj = { a: { b: { c: 42 } } };
      assert.strictEqual(schemaManager._getNestedValue(obj, 'a.b.c'), 42);
      assert.strictEqual(schemaManager._getNestedValue(obj, 'a.x'), undefined);
    });

    test('_setNestedValue should create nested structures', () => {
      const obj = {};
      schemaManager._setNestedValue(obj, 'a.b.c', 42);
      assert.deepStrictEqual(obj, { a: { b: { c: 42 } } });
    });

    test('_isFieldExplicitlyProvided should check existence accurately', () => {
      const doc = { a: { b: null }, c: undefined };
      assert.strictEqual(schemaManager._isFieldExplicitlyProvided(doc, 'a.b'), true); // null is explicitly provided
      assert.strictEqual(schemaManager._isFieldExplicitlyProvided(doc, 'a.c'), false);
      assert.strictEqual(schemaManager._isFieldExplicitlyProvided(doc, 'x.y'), false);
    });
      it("_mergeObjFast should correctly flatten objects and track docSet", () => {
            const input = { email: "a@b.com", details: { age: 30, city: "NY" } };
            const result = {};
            const docSet = new Set();
            
            schemaManager._mergeObjFast(input, "user", result, docSet);
            
            assert.strictEqual(result["user.email"], "a@b.com");
            assert.strictEqual(result["user.details.age"], 30);
            assert.strictEqual(result["user.details.city"], "NY");
            assert.strictEqual(docSet.has("user.email"), true);
            assert.strictEqual(docSet.has("user.details.age"), true);
            assert.strictEqual(docSet.has("user.details.city"), true);
        });
  });

  // ==========================================================================
  // 4. DOCUMENT VALIDATION (CORE LOGIC)
  // ==========================================================================
  describe('validateDocument', () => {
    
    test('should successfully validate and sanitize a valid nested document', async () => {
      const builder = new SchemaBuilder('strict_users')
        .object({ name: 'accountInfo' })
        .string({ name: 'accountInfo.email', config: { required: true } })
        .number({ name: 'accountInfo.age', attrs: { type: 'int' } });
      
      applicationSchemaRegistry.register('strict_users', builder);

      const payload = {
        accountInfo: {
          email: '  test@example.com  ',
          age: '25'
        }
      };

      const sanitized = await schemaManager.validateDocument('strict_users', payload, {}, false);

      assert.strictEqual(sanitized.accountInfo.email, 'test@example.com'); // Trimmed
      assert.strictEqual(sanitized.accountInfo.age, 25); // Casted to number
      assert.ok(sanitized.accountInfo);
    });

    test('should throw Security Exception for forbidden/unmapped fields', async () => {
      const builder = new SchemaBuilder('secure_users')
        .object({ name: 'accountInfo' })
        .string({ name: 'accountInfo.email', config: { required: true } });
      
      applicationSchemaRegistry.register('secure_users', builder);

      const payload = {
        accountInfo: {
          email: 'test@example.com',
          isAdmin: true // <-- Forbidden field
        }
      };

      await assert.rejects(
        async () => await schemaManager.validateDocument('secure_users', payload, {}, false),
        (err) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual(err.statusCode, 400);
          assert.match(err.message, /Security Exception: Direct modification of undefined structural fields \[accountInfo.isAdmin\]/);
          return true;
        }
      );
    });

    test('should throw Validation Failure for missing required fields on INSERT', async () => {
      const builder = new SchemaBuilder('required_users')
        .object({ name: 'accountInfo' })
        .string({ name: 'accountInfo.email', config: { required: true } });
      
      applicationSchemaRegistry.register('required_users', builder);

      const payload = {
        accountInfo: {
          age: 30 // Missing required 'email'
        }
      };

      await assert.rejects(
        async () => await schemaManager.validateDocument('required_users', payload, {}, false),
        (err) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual(err.statusCode, 400);
          assert.match(err.message, /Required field 'accountInfo\.email' is missing/);
          return true;
        }
      );
    });

    test('should ALLOW missing required fields on UPDATE (Partial Update)', async () => {
      const builder = new SchemaBuilder('update_users')
        .object({ name: 'accountInfo' })
        .string({ name: 'accountInfo.email', config: { required: true } })
        .number({ name: 'accountInfo.age' });
      
      applicationSchemaRegistry.register('update_users', builder);

      const payload = {
        accountInfo: {
          age: 31 // Updating only age, email is missing but it's an update
        }
      };

      // isUpdate = true
      const sanitized = await schemaManager.validateDocument('update_users', payload, {}, true);
      
      assert.strictEqual(sanitized.accountInfo.age, 31);
      assert.strictEqual(sanitized.accountInfo.email, undefined); // Correctly omitted
    });

    test('should allow ANY nested fields in a "Black-Box" object (no hasNestedChildren)', async () => {
      const builder = new SchemaBuilder('flexible_users')
        .object({ name: 'metadata' }); // No 'metadata.*' fields defined
      
      applicationSchemaRegistry.register('flexible_users', builder);

      const payload = {
        metadata: {
          customField1: 'value1',
          customField2: 123,
          nested: { deep: true }
        }
      };

      const sanitized = await schemaManager.validateDocument('flexible_users', payload, {}, false);
      
      // Should pass without throwing "undefined structural fields"
      assert.deepStrictEqual(sanitized.metadata, payload.metadata);
    });

    test('should handle null values correctly based on nullable config', async () => {
      const builder = new SchemaBuilder('nullable_users')
        .string({ name: 'bio', config: { required: false, nullable: true } })
        .string({ name: 'username', config: { required: true, nullable: false } });
      
      applicationSchemaRegistry.register('nullable_users', builder);
      
      

      const payload = {
        username: 'john',
        bio: null
      };

      const sanitized = await schemaManager.validateDocument('nullable_users', payload, {}, false);
      
      assert.strictEqual(sanitized.bio, null);

      // Test non-nullable rejection
      const badPayload = { username: null };
      await assert.rejects(
        async () => await schemaManager.validateDocument('nullable_users', badPayload, {}, false),
        /Error: Validation Failure: Required field 'username' is missing/
      );
    });

    test('should skip required checks for fields in skipRequired dictionary', async () => {
      const builder = new SchemaBuilder('skip_users')
        .string({ name: '_id', config: { required: true } })
        .string({ name: 'username', config: { required: true } });
      
      applicationSchemaRegistry.register('skip_users', builder);

      const payload = { username: 'john' }; // _id is missing

      // _id is in default skipRequired
      const sanitized = await schemaManager.validateDocument('skip_users', payload, { "_id": true }, false);
      assert.strictEqual(sanitized.username, 'john');
    });

    test('should operate with mongo object dot notation and normal objec', async () => {
      
      /**mongo Dot notation eg . ('accountInfo.email') */
        const builder = new SchemaBuilder('dot_users')
        .object({ name: 'accountInfo' })
        .string({ name: 'accountInfo.email', config: { required: true } })
        .number({ name: 'accountInfo.age' });

        /**normal object {_id:123 , username:"yaser"} */

      const builder1 = new SchemaBuilder('normal_users')
        .object({name:"details",config:{required:true}})
        .string({ name: '_id', config: { required: true } })
        .string({ name: 'username', config: { required: true } });
      
      applicationSchemaRegistry.register('dot_users', builder);
       applicationSchemaRegistry.register('normal_users', builder1);

      let payload = { accountInfo:{
        email : "example@yahoo.com",
        age: 30,


      }  }; // dot 

      // _id is in default skipRequired
      let sanitized = await schemaManager.validateDocument('dot_users', payload, { "_id": true }, false);
      assert.strictEqual(sanitized.accountInfo.email, 'example@yahoo.com');

      payload={
        details:{log:true,audit:"no"},
        username:"yasser",
        _id:"123"
      }
       sanitized = await schemaManager.validateDocument('normal_users', payload, { "_id": true }, false);
      assert.strictEqual(sanitized.username, 'yasser');
      assert.strictEqual(sanitized.details.log,true)


    });
        it("should successfully validate and reconstruct nested dot-notation documents", async () => {
            const builder = new SchemaBuilder("userProfiles")
                .object({ name: "accountInfo", config: { nullable: false } })
                .string({ name: "accountInfo.email", config: { required: true } })
                .number({ name: "accountInfo.age", config: { required: false } })
                .string({ name: "status", config: { required: true } });
            
            applicationSchemaRegistry.register("userProfiles", builder);

            const payload = {
                accountInfo: { email: "test@example.com", age: 25 },
                status: "active"
            };

            const sanitized = await schemaManager.validateDocument("userProfiles", payload, {}, false);

            assert.strictEqual(sanitized.accountInfo.email, "test@example.com");
            assert.strictEqual(sanitized.accountInfo.age, 25);
            assert.strictEqual(sanitized.status, "active");
        });

        it("should block unmapped top-level structural fields (Security Exception)", async () => {
            const builder = new SchemaBuilder("secureProfiles")
                .string({ name: "username", config: { required: true } });
            
            applicationSchemaRegistry.register("secureProfiles", builder);

            const payload = {
                username: "validUser",
                maliciousField: "hacked" // Not in schema
            };

            await assert.rejects(
                async () => await schemaManager.validateDocument("secureProfiles", payload, {}, false),
                (err) => {
                    assert.ok(err instanceof AppError);
                    assert.strictEqual(err.statusCode, 400);
                    assert.match(err.message, /Security Exception: Direct modification of undefined structural fields/);
                    return true;
                }
            );
        });

        it("should block unmapped nested fields inside an object container", async () => {
            const builder = new SchemaBuilder("nestedSecure")
                .object({ name: "profile", config: { nullable: false } })
                .string({ name: "profile.name", config: { required: true } });
            
            applicationSchemaRegistry.register("nestedSecure", builder);

            const payload = {
                profile: { 
                    name: "John",
                    secretToken: "12345" // Not in schema
                }
            };

            await assert.rejects(
                async () => await schemaManager.validateDocument("nestedSecure", payload, {}, false),
                (err) => {
                    assert.ok(err instanceof AppError);
                    assert.strictEqual(err.statusCode, 400);
                    assert.match(err.message, /Security Exception: Direct modification of undefined structural fields/);
                    return true;
                }
            );
        });
        
        it("should enforce required fields unless skipped or managed by system", async () => {
            const builder = new SchemaBuilder("requiredTest")
                .string({ name: "mandatoryField", config: { required: true } });
            
            applicationSchemaRegistry.register("requiredTest", builder);

            await assert.rejects(
                async () => await schemaManager.validateDocument("requiredTest", {}, {}, false),
                (err) => {
                    assert.ok(err instanceof AppError);
                    assert.strictEqual(err.statusCode, 400);
                    assert.match(err.message, /Required field 'mandatoryField' is missing/);
                    return true;
                }
            );
        });

    
  });
});