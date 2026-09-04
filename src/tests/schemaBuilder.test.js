import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SchemaBuilder } from '../framework/SchemaBuilder.js'; // Adjust path if needed
import { Schema } from '../framework/Schema.js';

describe("Unit Test: SchemaBuilder", () => {
    
    describe("Compile(Build) compileValidator - Legacy Equivalents", () => {
        
        it("should Compile Explicit Validator and Return BSON String Type of a given field", () => {
            const builder = new SchemaBuilder("users").string({ name: "email" });
            const compiled = builder.compileValidator();
            assert.strictEqual(compiled.validator.$jsonSchema.properties.email.bsonType, 'string');
        });

        it("should Compile Explicit Validator and Return BSON (String,Number) Type of given fields using Method Chaining", () => {
            const builder = new SchemaBuilder("users")
                .string({ name: "email" })
                .number({ name: "age" });
            const compiled = builder.compileValidator();
            assert.strictEqual(compiled.validator.$jsonSchema.properties.email.bsonType, 'string');
            assert.strictEqual(compiled.validator.$jsonSchema.properties.age.bsonType, 'number');
        });

        it("should Compile Explicit Validator and Return BSON (string,number,bool) Type", () => {
            const builder = new SchemaBuilder("users")
                .string({ name: "email" })
                .number({ name: "age" })
                .bool({ name: "value" });
            const compiled = builder.compileValidator();
            assert.strictEqual(compiled.validator.$jsonSchema.properties.email.bsonType, 'string');
            assert.strictEqual(compiled.validator.$jsonSchema.properties.age.bsonType, 'number');
            assert.strictEqual(compiled.validator.$jsonSchema.properties.value.bsonType, 'bool');
        });

        it("should correctly register a single field into the required validation array", () => {
            const builder = new SchemaBuilder("users").string({ name: "username" , config: { required: true } });
            const compiled = builder.compileValidator();
            assert.ok(compiled.validator.$jsonSchema.required.includes('username'));
        });

        it("should correctly register multiple fields into the required validation array", () => {
            const builder = new SchemaBuilder("users")
                .string({ name: "username" , config: { required: true } })
                .string({ name: "email" , config: { required: true } })
                .number({ name: "counter" , config: { required: true } });
            const compiled = builder.compileValidator();
            
            assert.ok(compiled.validator.$jsonSchema.required.includes('username'));
            assert.ok(compiled.validator.$jsonSchema.required.includes('email'));
            assert.ok(compiled.validator.$jsonSchema.required.includes('counter'));
        });

        it("should correctly register index profiles securely", () => {
            const builder = new SchemaBuilder("users")
                .string({ name: "username" , config: { required: true } })
                .index({ "username": 1 }, { unique: true });
            
            const indexArr = builder.getIndex();
            assert.strictEqual(indexArr[0].key.username, 1);
            assert.strictEqual(indexArr[0].option.unique, true);
        });
    });

    describe("Extended Features & System Architecture Rules", () => {

        it("should correctly compile Timestamps and Concurrency Versioning (OCC)", () => {
            const builder = new SchemaBuilder("orders");
            builder.withTimestamps(); 
            builder.withVersionConcurrencyControl(); 
            
            const properties = builder.getProperties(); 
            
            // System fields assertions
            assert.strictEqual(properties.createdAt.mongoRoles.bsonType, 'date');
            assert.strictEqual(properties.createdAt.appRoles.immutable, true);
            
            assert.strictEqual(properties.updatedAt.mongoRoles.bsonType, 'date');
            assert.strictEqual(properties.updatedAt.appRoles.immutable, false);
            
            assert.strictEqual(properties.version.mongoRoles.bsonType, 'number');
            assert.strictEqual(properties.version.appRoles.immutable, false); // Mutable to allow increments
        });

        it("should build array, object, time, and binData field types correctly", () => {
            const builder = new SchemaBuilder("media")
                .array({ name: 'tags', attrs: { minItems: 1 } })
                .object({ name: 'metadata' })
                .time({ name: 'publishedAt' })
                .binData({ name: 'payload', attrs: { minLength: 10 } });

            const properties = builder.getProperties();
            assert.strictEqual(properties.tags.mongoRoles.bsonType, 'array');
            assert.strictEqual(properties.tags.mongoRoles.minItems, 1);
            assert.strictEqual(properties.metadata.mongoRoles.bsonType, 'object');
            assert.strictEqual(properties.publishedAt.mongoRoles.bsonType, 'date');
            assert.strictEqual(properties.payload.mongoRoles.bsonType, 'binData');
            assert.strictEqual(properties.payload.mongoRoles.minLength, 10);
        });

        it("should dynamically alter property attributes securely", () => {
            const builder = new SchemaBuilder("inventory");
            builder.number({ name: 'stock', attrs: { minimum: 0 } });
            
            builder.setMongoPropertyAttribute('stock', 'maximum', 100);
            
            const property = builder.getProperty('stock');
            assert.strictEqual(property.mongoRoles.minimum, 0);
            assert.strictEqual(property.mongoRoles.maximum, 100);
        });

        it("should throw an error when indexing a non-existent field", () => {
            const builder = new SchemaBuilder("logs").string({ name: "message" });
            builder.index({ invalidField: 1 });

            assert.throws(() => {
                builder.compileValidator();
            }, /Schema Compilation Error: Cannot create an index on "invalidField"/);
        });

    });

    describe("Application Roles (appRoles) Configuration & Defaults", () => {

        it("should correctly configure and store explicit custom appRoles", () => {
            const builder = new SchemaBuilder("users")
                .string({ 
                    name: "email", 
                    config: { 
                        required: true, 
                        immutable: true, 
                        nullable: true, 
                        select: false,
                        restrictedRoles: ["admin", "moderator"]
                    } 
                });

            const properties = builder.getProperties();
            const emailAppRoles = properties.email.appRoles;

            assert.strictEqual(emailAppRoles.immutable, true);
            assert.strictEqual(emailAppRoles.nullable, true);
            assert.strictEqual(emailAppRoles.select, false);
            assert.deepStrictEqual(emailAppRoles.restrictedRoles, ["admin", "moderator"]);
            
            // Verify that 'required' is handled separately in the required set rather than remaining in appRoles
            assert.ok(builder.getRequired().has("email"));
            assert.strictEqual(emailAppRoles.required, undefined);
        });

        it("should apply correct default fallback appRoles values when config options are omitted", () => {
            const builder = new SchemaBuilder("posts").string({ name: "title" });
            
            const properties = builder.getProperties();
            const titleAppRoles = properties.title.appRoles;

            assert.strictEqual(titleAppRoles.immutable, false);
            assert.strictEqual(titleAppRoles.nullable, false);
            assert.strictEqual(titleAppRoles.select, true);
            assert.strictEqual(titleAppRoles.restrictedRoles, false);
            assert.strictEqual(titleAppRoles.managedBySystem, false);
        });

    });
});