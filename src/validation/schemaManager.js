

import { BSONType, Collection , Binary } from "mongodb";
import { AppError } from "../framework/appError.js";
import { collectionManager } from "../framework/CollectionManager.js";
import { applicationSchemaRegistry } from "../framework/applicationSchemaRegistry.js";
import { frameworkConfig } from "../config/frameworkConfig.js";
import { record, auditLog } from "../Monitor/monitoringSystem.js";
import { EVENT_TYPES,EVENT_MTYPES,DOMAIN } from "../Monitor/constant/eventType.js";
import { ObjectId } from "mongodb/lib/bson.js";


class SchemaValidationManager {
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
        throw new AppError(`Database Error: collection ${collectionName} not in Active cache`, 404);
    }

    const items = await coll.options();

    if (!items?.validator?.$jsonSchema) {
        this.schemaCache[collectionName] = { required: new Set(), properties:null };
        return this.schemaCache[collectionName];
    }

    const reqd = items.validator.$jsonSchema.required || [];
    const prop = items.validator.$jsonSchema.properties || {};
    const fieldNames = Object.getOwnPropertyNames(prop);

    // 1. Pre-calculate which root keys have nested children (O(N) run ONCE)
    const parentKeysWithChildren = new Set();
    for (let i = 0; i < fieldNames.length; i++) {
        if (fieldNames[i].includes('.')) {
            parentKeysWithChildren.add(fieldNames[i].split('.')[0]);
        }
    }

    // 2. Build normalized properties with the flag
    const normalizedProp = {};
    for (let i = 0; i < fieldNames.length; i++) {
        const name = fieldNames[i];
        normalizedProp[name] = {
            mongoRoles: { ...prop[name] },
            appRoles: {
                ...(prop[name].appRoles || {}), // Preserve any existing appRoles
                hasNestedChildren: parentKeysWithChildren.has(name) // THE MAGIC FLAG
            }
        };
    }

    this.schemaCache[collectionName] = {
        required: new Set(reqd),
        properties: normalizedProp,
        validSchemaKeys: new Set(fieldNames) // For O(1) security checks
    };

    return this.schemaCache[collectionName];
}
/**
 * used for load schema from cached aplication schema register
 * @param {String} collectionName 
 * @returns 
 */


    loadRegisterdSchema(collectionName) {
    try {
        const baseSchema = applicationSchemaRegistry.getSchema(collectionName);
        const properties = baseSchema.getProperties();
        const required = baseSchema.getRequired();
        const fieldNames = Object.getOwnPropertyNames(properties);

        return {
            required: new Set(required),
            properties: properties,
            validSchemaKeys: new Set(fieldNames)
        };
    } catch (err) {
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
       if (val !== null && typeof val === "object" && (val.constructor === Object || !val.constructor)) {
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

        const expectedBsonType = fieldSchema.mongoRoles?.bsonType;
        
        let proccessValue = value;

        
            try {
                proccessValue = this.formatValue(fieldName,collectionName,expectedBsonType,value,fieldSchema.mongoRoles);

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

//for check exist key in object nested object in mongo collection 

_isFieldExplicitlyProvided(doc, fieldName) {
    const keys = fieldName.split('.');
    let current = doc;
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
 
        if (current === null || typeof current !== 'object' || !(key in current)) {
            return false;
        }
        current = current[key];
    }
    return true;
}

/**
 * we used this method as helper method to flatting object for example {accountInfo:{email:"example@yahoo.com",age:10} } \
 * become {"accountInfo.email" : "example@yahoo.com" ,"accountInfo.age": 10} to match mongo object naming dot notation 
 * @param {Object} obj -- object need to map to dot notation 
 * @param {String} prefix -- prefix of dot notaion like choose info and prop name is age its become "info.age"
 * @param {Object} result -- contain new object as result of running this method 
 * @param {Set} docSet -- bucket contain new keys 
 */

_mergeObjFast(obj, prefix = "", result = {},docSet=new Set()) {
 
  const keys = Object.keys(obj);

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const val = obj[key];
    const fullKey = prefix ? prefix + "." + key : key;

    // Fast check for plain objects (safely handles null and Object.create(null))
    if (
      val !== null &&
      typeof val === "object" &&
      (val.constructor === Object || !val.constructor)
    ) {
      this._mergeObjFast(val, fullKey, result,docSet);
    } else {
      result[fullKey] = val;
      docSet.add(fullKey);
    }
  }
}


/**
 * update for validateDocument 
 * befor 
 * its not differeniated between mongo object filed name eg (accountInfo :{email:""} and "accountInfo.email")
 * i try monualy flaten object name her but its take alot of overhead and its degrade in performance by doing this 
 *  for (const docKey of docKeys) {
            if (schemaBlueprint?.[docKey] === undefined){
                throw new err(`this field ${docKey} not define in schema`)
            }


            if(schemaBlueprint[docKey].bsonType === 'object' ){
               
                for(const nestkey in doc[docKey]){

                    const prefex=`${docKey}.${nestkey}`

                    if(schemaBlueprint[prefex] !== undefined){
                        isDot[docKey]=true;
                        newdoc[prefex]=doc[docKey][nestkey]
                        docSet.add(prefex)
                       
                    }else{
                   
                    if(newdoc[docKey] === undefined){
                         newdoc[docKey]={};
                         docSet.add(docKey)
                         if(isDot[docKey]) {
                            throw new AppError(`mixed object named with dot and not dot not allow or mulform field name ${docKey}----${doc[docKey][nestkey]}`)
                         }
                    }
                     isDot[docKey]=false;
                
                    newdoc[docKey][nestkey]=doc[docKey][nestkey];
                    }   
                }
            }else{
            
            newdoc[docKey]=doc[docKey]
            docSet.add(docKey)

            }

so it not good it q(n*n) do to deep for loop and searching  it have deep loop and violit some restriction 
i update this method 
now its have better 



    -  O(1) Nested Field Validation: 
    Instead of using expensive O(N2) deep-loop flattening to handle nested dot-notation fields (e.g., accountInfo.email),
    the system pre-calculates a hasNestedChildren flag during schema loading. This allows for instant, direct O(1) lookups,
    making it the fastest possible execution path in the V8 engine.
    - Guaranteed Data Reconstruction: 
    By avoiding manual, error-prone flattening and utilizing the _setNestedValue method, the output sanitizerDoc is guaranteed to be perfectly nested and structured.
    This ensures MongoDB always receives clean, valid, and properly formatted documents.
    - Flawless Security (Zero-Trust Validation): 
    The allow-list check elegantly handles both strict objects (blocking unknown nested keys) and black-box objects. 
    Any attempt to inject unmapped structural fields is immediately caught and blocked with a clean, professional error,
    protecting the application from NoSQL injection and data-padding attacks.
    Complete Registry Parity: 
    Whether a schema is loaded directly from the MongoDB $jsonSchema or from the in-memory applicationSchemaRegistry, the pre-calculation logic ensures identical, consistent behavior across the entire framework.
 * 
 * @param {import("../rbac/constant/typesDef.js").ResourcesName} collectionName 
 * @param {object} doc 
 * @param {object} skipRequired -- dectionary object contain key that must be skip when checking for requirty 
 * @param {boolean} isUpdate -- if true the operation is update if false the operation is new 
 * @returns 
 */

async validateDocument(collectionName, doc, skipRequired = { "_id": true, "createdAt": true, "updatedAt": true }, isUpdate) {
    const startTime = performance.now();
    try {
        if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
            throw new AppError("Validation Failure: Document payload must be a valid object.", 400);
        }

        const schema = await this.getSchema(collectionName);
        const schemaBlueprint = schema.properties;
        const schemaRequired = schema.required;
        const schemaBlueprintKeys = Object.getOwnPropertyNames(schemaBlueprint);
        const validSchemaKeys = schema.validSchemaKeys || new Set(schemaBlueprintKeys);

        let sanitizerDoc = {};
        let newdoc=Object.create(null);
        const docKeys = Object.getOwnPropertyNames(doc);
      
        const docSet=new Set();

        // SECURITY CHECK: O(N) loop with O(1) lookups. No flattening, no crashes.
      
        for (let i = 0; i < docKeys.length; i++) {
            const docKey = docKeys[i];
            
            // Fast path: Is it an exact schema field instead of iteration its q(1)
            let isAllowed = validSchemaKeys.has(docKey);
        
            if(isAllowed){
                if(schemaBlueprint[docKey].appRoles.hasNestedChildren){
      
   
                    this._mergeObjFast(doc[docKey],docKey,newdoc,docSet)
      
                    
                    

                }else{
                    newdoc[docKey]=doc[docKey]
                    docSet.add(docKey);

                }
                 
            }else{
                 throw new AppError(`Security Exception: Direct modification of undefined structural fields [${docKey}] is blocked.`, 400)
            }
        }

       
        // 2. PROCESSING LOOP: O(M) with ZERO pre-calculation overhead
        for (let i = 0; i < schemaBlueprintKeys.length; i++) {
            const fieldName = schemaBlueprintKeys[i];
            const fieldDefinition = schemaBlueprint[fieldName];
            const fieldMongoRoles = fieldDefinition.mongoRoles;
            const fieldappRoles = fieldDefinition.appRoles;

            const isObjectContainer = fieldMongoRoles.bsonType === 'object' || fieldMongoRoles.bsonType === 'array';

            docSet.delete(fieldName);
            
            // SCENARIO B (Strict Mode): Read directly from appRoles! Zero overhead.
            // If it's an object/array AND the schema builder flagged it as having nested children, skip the parent. if not it must validate 
            if (isObjectContainer && fieldappRoles.hasNestedChildren) {
                continue; 
            }

            // SCENARIO A (Black-box) or Leaf Node: Extract the value safely
            const fieldValue = newdoc[fieldName];

            // Required check enforcement
            if (fieldValue === undefined || fieldValue === null) {
                if (schemaRequired.has(fieldName) && (!skipRequired[fieldName] && !fieldappRoles?.managedBySystem)) {
                    if (!isUpdate || (fieldName in newdoc)) {
                     throw new AppError(`Validation Failure: Required field '${fieldName}' is missing.`, 400);
                    }
                }
                if(fieldValue === undefined) continue; 
            }

            // Format & validate the value 
            const validatedValue = this._proccessAndValidateValue(collectionName, fieldName, fieldValue,fieldDefinition);

            //  Write back to sanitized document (Guarantees perfect nested structure)
            this._setNestedValue(sanitizerDoc, fieldName, validatedValue);
        }

        if(docSet.size > 0){
              throw new AppError(`Security Exception: Direct modification of undefined structural fields [${[...docSet].join(', ')}] is blocked.`, 400)
        }
        
        // Correct metrics calculation
        const durationMs = performance.now() - startTime;
        record(DOMAIN.ODM_DOMAIN, EVENT_TYPES.SCHEMA_VALIDATE_END, EVENT_MTYPES.METRIC_H, durationMs * 1000000);
        auditLog(DOMAIN.ODM_DOMAIN, 'document_validate', { actor: 'system' }, { collection: collectionName }, 'success', { durationMs });

        return sanitizerDoc;

    } catch (err) {
        record(DOMAIN.ODM_DOMAIN, EVENT_TYPES.SCHEMA_VALIDATE_ERROR, EVENT_MTYPES.METRIC_C);
        auditLog(DOMAIN.ODM_DOMAIN, 'document_validate_failed', { actor: 'system' }, { collection: collectionName, error: err.message }, 'failure');
        throw err; 
    }
}


}



export const schemaManager = new SchemaValidationManager();
