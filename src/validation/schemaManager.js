

import { BSONType, Collection } from "mongodb";
import { AppError } from "../framework/appError.js";
import { collectionManager } from "../framework/CollectionManager.js";


class SchemaValidationMananger {
    constructor() {
        this.schemaCache = {};
        this.formatMap = {
            string : "string",
            int    : "number",
            long   : "number",
            double : "number",
            bool   : "boolean",
            date   : "object",
            number : "number"
        };

        
    }
/**
 * 
 * @param {String} collectionName -- 
 * @returns {Collection} MongoDb Collection Objects
 */
    async loadSchema(collectionName) {

        const coll = await collectionManager.getCollection(collectionName);
        if (!coll) {
            throw new AppError(`Database Error: collection ${collectionName} no in Active cache `, 404);
        }

        const items = await coll.options();
       


        if (!items?.validator?.$jsonSchema) {
            this.schemaCache[collectionName] = { required: [], properties: null };
            return this.schemaCache[collectionName];
        }



        this.schemaCache[collectionName] = {
            required: items.validator.$jsonSchema.required,
            properties: items.validator.$jsonSchema.properties
        };

        return this.schemaCache[collectionName];

    }

    /**
 * 
 * @param {String} collectionName -- 
 * @returns {Collection} MongoDb Collection Objects
 */
    async getSchema(collectionName) {
        if (!this.schemaCache[collectionName]) {
            await this.loadSchema(collectionName);
        }
        return this.schemaCache[collectionName];
    }
    /**
     * 
     * @param {BSONType} type 
     * @param {*} val 
     * @returns formating val or error
     */
 formatValue(type, val) {
  switch (type) {
    case 'string': {
      if (val === undefined || val === null) return "";
      return typeof val === 'string' ? val.trim() : String(val).trim();
    }

    case 'int':
    case 'long': {
      
       const num = Number(val); 
        //catch '' "" "  "
      if (num === 0 && val !== 0 && val !== "0") {
         throw new Error(`value must be valid ${type}`);
      }
      if (!Number.isInteger(num) || num != val) {
        throw new Error(`value must be valid ${type}`);
      }
      return num;
    }

    case 'double':
    case 'number': {
      
      const num = Number(val);
       //catch '' "" "  "
      if (num === 0 && val !== 0 && val !== "0") {
         throw new Error(`value must be valid ${type}`);
      }
      if (Number.isNaN(num) || num != val) {
        throw new Error("value must be valid decimal number");
      }
      return num;
    }

    case 'bool': {
      if (val === "true" || val === 1 || val === true) return true;
      if (val === "false" || val === 0 || val === false) return false;
      throw new Error("value must be valid boolean");
    }

    case 'date': {
      const date = val instanceof Date ? val : new Date(val);
      if (Number.isNaN(date.getTime())) throw new Error("value must be valid Date Format");
      return date;
    }

    default:
      throw new Error("Unknown type");
  }
}
   
/**
 * Internel Function 
 * @param {Collection} collectionName 
 * @param {String} fieldName 
 * @param {*} value 
 * @param {*} fieldSchema -- field properties (Attr) 
 * @returns Formated Value if value number "40" => 40 or if string have ending space or starting space it trim
 */
_proccessAndValidateValue(collectionName, fieldName, value, fieldSchema) {

        if (value === undefined) {
            throw new AppError(`Validation Error: undefined value in field '${fieldName}' is not valid for collection ${collectionName}`, 400);

        }

        if (value == null) return null;

        const expectedBsonType = fieldSchema?.bsonType;
        
        let proccessValue = value;

        
            try {
                proccessValue = this.formatValue(expectedBsonType,value);

            } catch (error) {
                throw new AppError(`Validation Error: Field ${fieldName} ${error.message}`, 400);

            }

        
        if (fieldSchema.pattern) {
            const regx = new RegExp(fieldSchema.pattern);
            if (!regx.test(proccessValue)) {
                throw new AppError(`Validation Error: Field ${fieldName} in collection ${collectionName} not valid format`, 400);
            }
        }
        return proccessValue;


    }

    /**
     * Validate and format single field 
     * @param {*} collectionName 
     * @param {*} fieldName 
     * @param {*} value 
     * @returns 
     */
    async validateField(collectionName, fieldName, value) {
        const schema = await this.getSchema(collectionName);

        if (!schema.properties) {
            throw new AppError(`Framework Error: Schema context for collection "${collectionName}" does not exist.`, 500);
        }

        const fieldAttr = schema.properties[fieldName];
        if (!fieldAttr) {
            throw new AppError(`Validation Error: Field "${fieldName}" is not defined in the "${collectionName}" schema Validator (blueprint).`, 400);
        }

        // Execute unified core processing channel
        const newValue = this._proccessAndValidateValue(collectionName, fieldName, value, fieldAttr);

        // Required constraint enforcement check
        if (schema.required.includes(fieldName)) {
            if (newValue === undefined || newValue === null || newValue === "") {
                throw new AppError(`Validation Error: Field "${fieldName}" is strictly required.`, 400);
            }
        }

        return newValue;
    }

    /**
     * 
     * @param {*} collectionName 
     * @param {*} doc -- Mongo Document 
     * @param {JSON} skipRequired -- contain Passed Field ,any field you need to execlude it from validation steps 
     * @param {bool} isUpdate -- true : operation is update , false: operation is create new doc
     * @returns Valid Document or error 
     */
    async validateDocument(collectionName, doc, skipRequired = {"_id":true, "createdAt":true, "updatedAt":true},isUpdate) {
    

    // Fast initial falsy check before attempting copy or parsing operations 
    if (!doc) {
        throw new AppError("Validation Error: Not a Valid Document", 400);
    }

    let newDocument = typeof doc === 'string' ? JSON.parse(doc) : { ...doc };
    
     const rawkey=Object.getOwnPropertyNames(newDocument);
     let docKey=[];
    // generate filtered key arry based on skiping
    for(let i=0 ; i<rawkey.length ;i++){
        const key=rawkey[i];
        if(!skipRequired[key]){
            docKey.push(key);
        }

    }
     if(docKey.length ===0 ){
        
        throw new AppError("Validation Error: Empty Document Not Allowed", 400);

    }

    const schema = await this.getSchema(collectionName);
    
    // maybe this collection does not have schema 
    if (!schema.properties || !schema.required) {
        return newDocument;
    }
    
    const schemaRequired=schema.required;

    let newRequired=Object.create(null);

    // filter required based on skiping 

    for(let i=0;i<schemaRequired.length;i++){
        const key=schemaRequired[i];
 if(!skipRequired[key]){
     newRequired[key]=true};
}

// newreq , dockey 
   
    
    const schemaProperties = schema.properties;
    

    // compine validation & update verification loop
    for (const field of docKey) {
        
        const value = newDocument[field];
        if (value === null) continue;

        const fieldSchema = schemaProperties[field];

        if (!fieldSchema) {
            throw new AppError(`Validation Error: field '${field}' is not valid for collection ${collectionName}`, 400);
        }

        // Run validation and re-assign formatted primitives
        const validatedValue = this._proccessAndValidateValue(collectionName, field, value, fieldSchema);
        newDocument[field] = validatedValue;

        //  Merge update validation checks right here inside the primary loop iteration!
        if (isUpdate && newRequired[field] && (validatedValue === "" || validatedValue === null)) {
            throw new AppError(`Validation Error: updated field '${field}' in collection '${collectionName}' cannot be empty`, 400);
        }
    }

    // Required schema constraints handler block for creation operations
    if (!isUpdate) {
        for (const field in newRequired) {
           

            const val = newDocument[field];
            // Explicit check ensures falsy zeros or booleans are not flagged as missing parameters
            if (val === 0 || val === false || (val !== undefined && val !== null && val !== "")) continue;

            throw new AppError(`Validation Error: required field '${field}' is missing or empty for collection ${collectionName}`, 400);
        }

        newDocument.createdAt = new Date();
        newDocument.updatedAt = newDocument.createdAt;
    } else {
        newDocument.updatedAt = new Date();
    }

    return newDocument;
}
}


export const schemaManager = new SchemaValidationMananger();
