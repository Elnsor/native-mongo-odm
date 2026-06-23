import {test,describe,mock,beforeEach,afterEach} from 'node:test'
import assert from 'node:assert/strict'
import { getDb, getDb as originalGetDb } from '../config/db.js'



const trackGetDb = mock.fn(originalGetDb).mock.mockImplementation( ()=> true )


mock.module("../config/db.js",{
    exports :{
        getDb : trackGetDb
    }
});

 let compiledSchema = {
            options: mock.fn(() => ({
                validator: {
                    $jsonSchema: {
                        required: ["username", "email"],
                        properties: {
                            username: { bsonType: "string", pattern: "^[a-zA-Z0-9]+$" },
                            email: { bsonType: "string" },
                            age: { bsonType: "int" },
                            isActive: { bsonType: "bool" }
                        }
                    }
                }
            }))
        };// end schemacollection 

        let mockCollectionManager={
            getCollection:mock.fn(async function(){
                return compiledSchema;
            })
        }
mock.module('../framework/CollectionManager.js', {
    exports: {
        collectionManager: mockCollectionManager
    }
});

const {schemaManager} = await import('../validation/schemaManager.js')

describe("(Unit Test): SchemaValidation Test",()=>{
    beforeEach(()=>{

    });
    afterEach(()=>{
        mockCollectionManager.getCollection.mock.resetCalls();
        compiledSchema.options.mock.resetCalls();
    });

     describe("gevin: loadSchema and getSchema", () => {

        test("should parse MongoDB $jsonSchema rules and cache them successfully", async () => {

            const schema = await schemaManager.getSchema("users");
            assert.equal(mockCollectionManager.getCollection.mock.calls.length,1)
            assert.equal(mockCollectionManager.getCollection.mock.calls[0].arguments[0],"users")
            
            assert.ok(schema.required.includes("username"))
            assert.strictEqual(schema.properties.username.bsonType,'string');


        })
    });// end describe

    describe("gevin: formatValue() Examin Primitive and Type Casting", () => {

        test("should cleanly trim strings and parse string primitives", () => {
            assert.strictEqual(schemaManager.formatValue("string", "  elkas  "),"elkas");
            assert.strictEqual(schemaManager.formatValue("string", 100),"100");


        })
    });// end describe

     describe("gevin: formatValue() Examin number Type ", () => {

       test("should cast valid numbers and throw an error on empty string primitives", () => {
            assert.strictEqual(schemaManager.formatValue("int", "45"),45);
            assert.strictEqual(schemaManager.formatValue("double", "12.5"),12.5);

            assert.throws( () => {
                  schemaManager.formatValue("int", "   ")
            },
                /value must be valid int/i
        )
            
        });
    });// end describe

    describe("gevin:validateDocument() Core Workflow Pass ", () => {

       test("should sanitize, trim, and validate an entire valid document on insertion structure passes", async () => {
            const inputDoc = {
                username: "  user123 ",
                email: "test@test.com",
                age: "30",
                isActive: 1
            };

            const validatedDoc = await schemaManager.validateDocument("users", inputDoc, undefined, false);

            assert.strictEqual(validatedDoc.username,"user123"); // Trimmed
            assert.strictEqual(validatedDoc.age,30);             // Casted to Number
            assert.strictEqual(validatedDoc.isActive,true);       // Casted to Boolean
            assert.strictEqual(validatedDoc.createdAt instanceof Date,true);
            assert.strictEqual(validatedDoc.updatedAt instanceof Date,true);
        });
    });// end describe

    describe("gevin: validateDocument() missing required Field ", () => {

        test("should throw a validation exception if a strictly required field is missing on creation", async () => {
            const incompleteDoc = {
                username: "user123"
                // 'email' parameter is completely missing here
            };

            await assert.rejects(async ()=>{

                 await schemaManager.validateDocument("users", incompleteDoc, undefined, false)
            },
            (err)=>{

                assert.match(err.message,/Validation Error: required/i);
                 return true;

            })

        });
    });// end describe

    describe("gevin: validateDocument() Test bad regex Pattern", () => {

        test("should reject document processing iterations if regex pattern constraints fail", async () => {
            const badPatternDoc = {
                username: "user_invalid_spaces!!", // Fails pattern verification regex rule
                email: "test@test.com"
            };

              await assert.rejects(async ()=>{

                 await schemaManager.validateDocument("users", badPatternDoc, undefined, false)
            },
            (err)=>{

                assert.match(err.message,/Field username in collection users not valid format/i);
                 return true;

            })

          
        });
    });// end describe

})
