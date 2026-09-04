

import { BSONType, Collection } from "mongodb";
import { AppError } from "../framework/appError.js";
import { collectionManager } from "../framework/CollectionManager.js";
import { applicationSchemaRegistry } from "../framework/applicationSchemaRegistry.js";
import { frameworkConfig } from "../config/frameworkConfig.js";


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
            number : "number",
            binData: "object",
            object : "object",
            array  : "object"
        };

        
    }
/**
 * its used for load mongodb schema schema from mongo server db  
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


        const reqd= items.validator.$jsonSchema.required;
        const prop= items.validator.$jsonSchema.properties

        const fieldNames=Object.getOwnPropertyNames(prop);

        const normalizedProp={}


        for(let i=0;i < fieldNames.length; i++){
            const name=fieldNames[i];
            normalizedProp[name]={mongoRoles:{...prop[name]},appRoles:{}}

        }

        this.schemaCache[collectionName] = {
            required:new Set(reqd),
            properties:normalizedProp,
           
           
        };

        return this.schemaCache[collectionName];

    }
/**
 * used for load schema from cached aplication schema register
 * @param {String} collectionName 
 * @returns 
 */
    loadRegisterdSchema(collectionName) {

        
        try{
            const baseSchema=applicationSchemaRegistry.getSchema(collectionName)

            return {
                required: baseSchema.getRequired(),
                properties: baseSchema.getProperties()

            };


        }catch(err){
            throw err;
        }
    }

    /**
 * its used for get schema 
 * @param {String} collectionName -- 
 * @returns {Collection} MongoDb Collection Objects
 */
    async getSchema(collectionName) {

        if(frameworkConfig.schemaDefaults.autoLoadingRegisterSchema){
            return this.loadRegisterdSchema(collectionName)
        }
     
            if (!this.schemaCache[collectionName]) {
           await this.loadSchema(collectionName);
            }
         
        

        const schema=this.schemaCache[collectionName];

        if(!schema.properties){
            throw new AppError(`Security Exception: Collection '${collectionName}' has no defined validation schema layout. Access denied.`, 403);
           }
           return schema;
    }


    
    /**
     * 
     * @param {String} name - name of the field 
     * @param {String} collname - name of the collection 
     * @param {string} type - bsonType 
     * @param {*} val 
     * @param {*} attr -- field attributes 
     * @returns process value 
     * @throws {AppError} -- if value is not valid 
     */
 formatValue(name,collname,type, val,attr) {
  switch (type) {
    case 'string': {
        let managedVal;
      managedVal = (val === undefined || val === null)?"" : String(val) ;

      if (frameworkConfig.schemaDefaults.autoTrimStrings) {
        managedVal = managedVal.trim();
    }

      if(attr.minLength && managedVal.length < attr.minLength){

            throw new Error(`Validation Error: Field ${name} in collection ${collname} actual sring value length less than minimim expected`);
        }
        if (attr.pattern) {
            const regx = new RegExp(attr.pattern);
            if (!regx.test(managedVal)) {
                throw new Error(`Field ${name} in collection ${collname} not valid format`);
            }
        }

      return managedVal;
    }
    case 'binData': {
                let byteLength = 0;
                let binaryOutput = val;

                if (Buffer.isBuffer(val)) {
                    byteLength = val.length;
                    binaryOutput = new Binary(val);
                } else if (val instanceof Binary) {
                    byteLength = val.buffer.length;
                } else if (val instanceof Uint8Array || ArrayBuffer.isView(val)) {
                    byteLength = val.byteLength;
                    binaryOutput = new Binary(Buffer.from(val.buffer, val.byteOffset, val.byteLength));
                } else if (val instanceof ArrayBuffer) {
                    byteLength = val.byteLength;
                    binaryOutput = new Binary(Buffer.from(val));
                } else if (typeof val === 'string') {
                    const buf = Buffer.from(val, 'base64');
                    byteLength = buf.length;
                    binaryOutput = new Binary(buf);
                } else {
                    throw new Error(`Field ${name} in collection ${collname} must be a valid Buffer, ArrayBuffer, Uint8Array, or BSON Binary instance`);
                }

                if (attr.minLength && byteLength < attr.minLength) {
                    throw new Error(`Validation Error: Field ${name} in collection ${collname} byte length (${byteLength}) is less than minimum expected (${attr.minLength})`);
                }

                if (attr.maxLength && byteLength > attr.maxLength) {
                    throw new Error(`Validation Error: Field ${name} in collection ${collname} byte length (${byteLength}) exceeds maximum allowed (${attr.maxLength})`);
                }

                return binaryOutput;
            }
    case 'object': {
    // Ultra-fast check for plain objects (excludes null, Array, Date, Buffer, Binary)
    if (val && val.constructor === Object) {
        return val;
    }
    throw new Error(`Field ${name} in collection ${collname} must be a valid plain Object`);
}

case 'array': {
        if (!Array.isArray(val)) {
            throw new Error(`Field ${name} in collection ${collname} must be a valid Array`);
        }

        if (attr.minItems !== undefined && val.length < attr.minItems) {
            throw new Error(`Validation Error: Field ${name} in collection ${collname} array length (${val.length}) is less than minimum expected (${attr.minItems})`);
        }

        if (attr.maxItems !== undefined && val.length > attr.maxItems) {
            throw new Error(`Validation Error: Field ${name} in collection ${collname} array length (${val.length}) exceeds maximum allowed (${attr.maxItems})`);
        }

        if (attr.uniqueItems) {
            const uniqueCheck = new Set(val.map(item => (item && typeof item === 'object' ? JSON.stringify(item) : item)));
            if (uniqueCheck.size !== val.length) {
                throw new Error(`Validation Error: Field ${name} in collection ${collname} must contain unique items`);
            }
        }

        // Optional: If an item schema definition is provided, recursively format/validate elements
        if (attr.items && attr.items.bsonType) {
            const itemType = attr.items.bsonType;
            for (let i = 0; i < val.length; i++) {
                try {
                    val[i] = this.formatValue(`${name}[${i}]`, collname, itemType, val[i], attr.items);
                } catch (err) {
                    throw new Error(`Invalid item at index ${i}: ${err.message}`);
                }
            }
        }

        return val;
    }

    case 'int':
    case 'long': {
      
       const num = Number(val); 
        //catch '' "" "  "
      if (num === 0 && val !== 0 && val !== "0") {
         throw new Error(`Field ${name}value must be valid ${type}`);
      }
      if (!Number.isInteger(num) || num != val) {
        throw new Error(`value must be valid ${type}`);
      }

      if(attr.minimum && num <attr.minimum){

            throw new Error(`Field ${name} in collection ${collname} actual number value  less than minimim expected`);
        }
        
      if(attr.maximum && num > attr.maximum){

            throw new Error(`Field ${name} in collection ${collname} actual number value  greater than maximum expected`);
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
        throw new Error(`Field ${name} of type ${type} value must be valid decimal number`);
      }

      if(attr.minimum && num < attr.minimum){

            throw new Error(`Field ${name} in collection ${collname} actual number value ${val}  less than minimim expected ${attr.minimum}`);
        }
        
      if(attr.maximum && num > attr.maximum){

            throw new Error(`Field ${name} in collection ${collname} actual number value ${val}  greater than maximum expected ${attr.maximum}`);
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
      throw new Error(`Unknown type in field ${name} in collection ${collname}`);
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

       // Handle null values based on schema configuration or type rules
    if (value === null) {
        // Check if explicitly marked as nullable in application roles or mongo roles
        const isNullable = fieldSchema?.appRoles?.nullable || fieldSchema?.nullable;

        if (isNullable) {
            return null; // Explicitly allowed to be null
        }

        throw new AppError(`Validation Error: Field '${fieldName}' in collection '${collectionName}' cannot be null`, 400);
    }

        const expectedBsonType = fieldSchema?.bsonType;
        
        let proccessValue = value;

        
            try {
                proccessValue = this.formatValue(fieldName,collectionName,expectedBsonType,value,fieldSchema);

            } catch (error) {
                throw new AppError(`Validation Error: ${error.message}`, 400);

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

   
_getNestedValue(obj, path) {
    if (!path.includes('.')) return obj?.[path];
    
    const keys = path.split('.');
    let current = obj;
    
    for (let i = 0; i < keys.length; i++) {
        if (current == null || typeof current !== 'object') return undefined;
        current = current[keys[i]];
    }
    
    return current;
}

/**
 * Sets a value on a target object using a dot-notation path, creating parent objects if missing
 * e.g., _setNestedValue(sanitizerDoc, "accountInfo.email", "john@example.com")
 */
_setNestedValue(obj, path, value) {
    if (!path.includes('.')) {
        obj[path] = value;
        return;
    }

    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (!current[key] || typeof current[key] !== 'object') {
            current[key] = {};
        }
        current = current[key];
    }

    current[keys[keys.length - 1]] = value;
}


async validateDocument(collectionName, doc, skipRequired = { "_id": true, "createdAt": true, "updatedAt": true }, isUpdate) {
    
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
        throw new AppError("Validation Failure: Document payload must be a valid object.", 400);
    }

    let sanitizerDoc = {};
    const schema = await this.getSchema(collectionName);
    
    const schemaBlueprint = schema.properties;
    const schemaRequired = schema.required; // Stored as Set
    const schemaBlueprintKey = Object.getOwnPropertyNames(schemaBlueprint);

    // Track unmapped fields to block unauthorized properties
    const docSet = new Set(Object.getOwnPropertyNames(doc));

    for (let i = 0; i < schemaBlueprintKey.length; i++) {
        const fieldName = schemaBlueprintKey[i]; // May be "accountInfo" or "accountInfo.email"
        const fieldDefinition = schemaBlueprint[fieldName];
        const fieldMongoRoles = fieldDefinition.mongoRoles;
        const fieldappRoles = fieldDefinition.appRoles;

        // 1. Extract value using dot-notation path lookup
        const fieldValue = this._getNestedValue(doc, fieldName);

        // Clear root key from unmapped set (e.g., "accountInfo")
        const rootKey = fieldName.split('.')[0];
        docSet.delete(rootKey);

        // 2. Skip parent object containers since children validate individually
        if (fieldMongoRoles.bsonType === 'object') {
            continue;
        }

        // 3. Required check enforcement
        if (fieldValue === undefined || fieldValue === null) {
            if (schemaRequired.has(fieldName) && (!skipRequired[fieldName] && !fieldappRoles?.managedBySystem)) {
                throw new AppError(`Validation Failure: Required field '${fieldName}' is missing.`, 400);
            }
            continue;
        }

        // 4. Format & validate primitive value[cite: 3]
        const validatedValue = this._proccessAndValidateValue(collectionName, fieldName, fieldValue, fieldMongoRoles);

        // 5. Write back to sanitized document using nested path setter
        this._setNestedValue(sanitizerDoc, fieldName, validatedValue);
    }
        
    // 6. Security Check: Block undefined structural fields[cite: 3]
    if (docSet.size > 0) {
        const forbiddenFields = [...docSet].join(', ');
        throw new AppError(`Security Exception: Direct modification of undefined structural fields [${forbiddenFields}] is blocked.`, 400);
    }

    return sanitizerDoc;
}
}


export const schemaManager = new SchemaValidationMananger();
