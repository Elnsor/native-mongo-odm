import { SchemaBuilder } from "../framework/SchemaBuilder.js";

describe("Unit Test: SchemaBuilder", () => {
    describe("Compile(Build) compileValidator", () => {
        
        
        describe("given: create field of Type String", () => {
            it("should Compile Explicit Validator and Return BSON String Type of a given field", () => {
                const builder = new SchemaBuilder().string({ name: "email" });
                const compiled = builder.compileValidator();
                expect(compiled.validator.$jsonSchema.properties.email.bsonType).toBe('string');
            });
        }); 

        
        describe("given: Method Chaining for string type and number type", () => {
            it("should Compile Explicit Validator and Return BSON (String,Number) Type of given fields", () => {
                const builder = new SchemaBuilder().string({ name: "email" }).number({ name: "age" });
                const compiled = builder.compileValidator();
                expect(compiled.validator.$jsonSchema.properties.email.bsonType).toBe('string');
                expect(compiled.validator.$jsonSchema.properties.age.bsonType).toBe('number');
            });
        });

        
        describe("given: Method Chaining for string, number, and boolean types", () => {
            it("should Compile Explicit Validator and Return BSON (string,number,bool) Type", () => {
                const builder = new SchemaBuilder().string({ name: "email" }).number({ name: "age" }).bool({ name: "value" });
                const compiled = builder.compileValidator();
                expect(compiled.validator.$jsonSchema.properties.email.bsonType).toBe('string');
                expect(compiled.validator.$jsonSchema.properties.age.bsonType).toBe('number');
                expect(compiled.validator.$jsonSchema.properties.value.bsonType).toBe('bool');
            });
        });

        
        describe("given: Adding field to required Array", () => {
            it("should correctly register field into the required validation array", () => {
                const builder = new SchemaBuilder().string({ name: "username" , config: { required: true } });
                const compiled = builder.compileValidator();
                expect(compiled.validator.$jsonSchema.required).toContain('username');
            });
        });

        describe("given: Adding multiple fields to required Array", () => {
            it("should correctly register fields into the required validation array", () => {
                const builder = new SchemaBuilder()
                    .string({ name: "username" , config: { required: true } })
                    .string({ name: "email" , config: { required: true } })
                    .number({ name: "counter" , config: { required: true } });
                const compiled = builder.compileValidator();
                expect(compiled.validator.$jsonSchema.required).toContain('username');
                expect(compiled.validator.$jsonSchema.required).toContain('email');
                expect(compiled.validator.$jsonSchema.required).toContain('counter');
            });
        });

   
        describe("given: Adding Index field to indexOption Array", () => {
            it("should correctly register index profiles securely", () => {
                const builder = new SchemaBuilder().string({ name: "username" , config: { required: true } }).index({ "username": 1 }, { unique: true });
                expect(builder.getIndex()[0].key.username).toBe(1);
                expect(builder.getIndex()[0].option.unique).toBe(true);
            });
        });

    });
});