
import { AppError } from "../framework/appError.js";
import { collectionManager } from "../framework/CollectionManager.js";


class SchemaValidationMananger {
    constructor() {
        this.schemCache = {};

        this.formater = {
            string: (val) => {
                if (val == undefined || val == null) return "";
                return String(val).trim();
            },
            int: (val) => {
                const num = parseInt(val, 10);
                if (isNaN(num) || num != val) throw new Error("value must be valid integer");
                return num;
            },
            long: (val) => {
                const num = parseInt(val, 10);
                if (isNaN(num) || num != val) throw new Error("value must be valid Long");
                return num;
            },
            double: (val) => {
                const num = parseFloat(val);
                if (isNaN(num || num != val)) throw new Error("value must be valid decimal number");
                return num;
            },
            bool: (val) => {
                if (val === "true" || val === 1 || val === true) return true;
                if (val === "false" || val === 0 || val === false) return false;
                throw new Error("value must be valid boolean");

            },
            date: (val) => {
                const date = val instanceof Date ? val : new Date(val);
                if (isNaN(date.getTime())) throw new Error("value must be valid Date Format");
                return date;
            },
            number: (val) => {
                const num = parseFloat(val);
                if (isNaN(num) || num != val ) throw new Error("value must valid number");
                return num;
            }


        }

        this.formatMap = {
            string: "string",
            int: "number",
            long: "number",
            double: "number",
            bool: "boolean",
            date: "object",
            number: "number"
        };
    }

    async loadSchema(collectionName) {

        const coll = collectionManager.getCollectionCache()[collectionName]
        if (!coll) {
            throw new AppError(`Database Error: collection ${collectionName} no in Active cache `, 404);
        }

        const items = await coll.options();


        if (!items?.validator?.$jsonSchema) {
            this.schemCache[collectionName] = { required: {}, properties: {} };
            return this.schemCache[collectionName];
        }

        const reqOpt = items.validator.$jsonSchema.required.reduce((acc, key) => {
            acc[key] = true;
            return acc;
        }, {});

        this.schemCache[collectionName] = {
            required: reqOpt,
            properties: items.validator.$jsonSchema.properties
        };

        return this.schemCache[collectionName];

    }

    async getSchema(collecionName) {
        if (!this.schemCache[collecionName]) {
            await this.loadSchema(collecionName);
        }
        return this.schemCache[collecionName];
    }

    async validateDocument(collecionName, doc, option = {}) {

        const { skipRequired = ["_id", "createdAt", "updatedAt"], update = false } = option

        let newdoc = typeof doc === 'string' ? JSON.parse(doc) : { ...doc };
        
         if (!newdoc ) {
            throw new AppError("Validation Error: Not Valid Document", 400);
        }
        if (Object.keys(newdoc).length === 0) {
            throw new AppError("Validation Error: Empty Document Not Allowed", 400);
        }

        const schema = await this.getSchema(collecionName);

        // if no schema for this doc 
        if (Object.keys(schema.properties).length === 0) return newdoc;



        // check for non exist field
        for (const key in newdoc) {
            if (!schema.properties[key]) {
                throw new AppError(`Validation Error: field ${key} not valid for collection ${collecionName}`, 400);
            }
        };

        // // check for non exist field and format the decoment field 
        for (const field in newdoc) {
            if (skipRequired.includes(field) || newdoc[field] === null) continue;

                       
            if (!schema.properties[field]) {
                throw new AppError(`Validation Error: field ${field} not valid for collection ${collecionName}`, 400);
            }

            if (newdoc[field] === undefined){
                throw new AppError(`Validation Error: undefined value in field ${field}  not valid for collection ${collecionName}`, 400);
            }

            const expectedBsonType = schema.properties[field]?.bsonType;
            const fieldSchema = schema.properties[field];
            const fromatter = this.formater[expectedBsonType];

            if (fromatter) {
                try {
                    newdoc[field] = fromatter(newdoc[field]);

                } catch (error) {
                    throw new AppError(`Validation Error: Field ${field} ${error.message}`, 400);

                }

            }
            if (fieldSchema.pattern) {
                const regx = new RegExp(fieldSchema.pattern);
                if (!regx.test(newdoc[field])) {
                    throw new AppError(`Validation Error: Field ${field} in collection ${collecionName} not valid format`, 400);
                }
            }

        }//end for



        // check for properties type 
        if (!update) {
            for (const field in schema.required) {

                if (newdoc[field] === 0 || newdoc[field] ) continue;

                    throw new AppError(`Validation Error: required filed ${field} is (missing or empty) for collection ${collecionName}`, 400);

            }

            
            newdoc.createdAt = new Date();
            newdoc.updatedAt = newdoc.createdAt;
        } else {
            for (const field in newdoc) {
                if (skipRequired.includes(field)) continue;
                if (schema.required[field] && (newdoc[field] === "" || newdoc[field] === null)) {
                    throw new AppError(`Validation Error: updated field '${field}' in collection '${collecionName}' cannot be empty`, 400);
                }
            }//for
            newdoc.updatedAt = new Date();
        }//else
        return newdoc;
    }

}


export const schemManager = new SchemaValidationMananger();
