import { BSON, BSONType } from "mongodb";
import { frameworkConfig } from "../config/frameworkConfig.js";
import { Schema } from "./Schema.js";


/**
 * @typedef {Object} FieldMangedBySytemParams 
 * @property {string} targetField // used for spicify the field name of document its vale need to pass evaluation function 
 * 
 * @typedef {Object } FieldMangedBySytem
 * @property {String} type -- type of function used e.g date or uuid
 * @property {FieldMangedBySytemParams} params -- contain the field name of document needed its value to evaluated the function
 */

/**
 * @typedef {Object} FieldConfigRole
 * 
 * @property {boolean} required - True the Field is required in the collection | false the Field is optional
 * @property {boolean} immutable - true the field is not allowed to update after init | false field is allowed to update
 * @property {boolean} strictImmutable - true if the field is immutable and its not initializeing (value is empty) then value kept empty not allowed to update one \
 *   | flase it alowed to update one only one update 
 * @property {boolean} select - when document is reading from db this selected value option is used to decided which field are alowed to fetch
 * id its true the field is allowed if its false the is fetch from db 
 * @property {FieldMangedBySytem | false} managedBySystem - its used to defined which all allowed to write or update this field \
 * if true that means the system who are write and update this field it its false the user write or update this field value  
 * @property {Array | false} restrictedRoles - when its array it contain user role like e.g ["admin","superAdmin"]that allowed to read from this fields
 *  if its flase the it then it not restricted
 * @property {boolean} nullable - when its true its accept the value for this field to be null otherwize not accepted to be null , nallable value only accepted when field is optional 
 * 
 */


export class SchemaBuilder extends Schema {

    constructor(collectionName,definition = {}) {
        super(collectionName,definition);

        this.propertyName = "";

    }
    /**
     * 
     * @param {FieldConfigRole} config 
     * @returns 
     */

    #applyDefaultconfig(config){

        const appRoles = {
        required: config.required,
        immutable: config.immutable || false,
        strictImmutable:config.strictImmutable ?? frameworkConfig.security.strictImmutableDefault,
        select: config.select !== undefined ? config.select : true,
        managedBySystem: config.managedBySystem || false,
        restrictedRoles: config.restrictedRoles || false,
        nullable: config.nullable !== undefined ? config.nullable : false
    };
    return appRoles;

    }

    #applySystemRules(name,mongoRoles,appRoles){

        const {required,...applicationRole}=appRoles
       
        if(required){
            this.setRequired(name);
        }
                
        this.setProperty(name,{mongoRoles:mongoRoles,appRoles:this.#applyDefaultconfig(applicationRole)});

    }

    /**
     *  {name: createdAt,config:{managedbyStytem:func}}
     * @param {String} name 
     * @param {Object} mongoRoles 
     * @param {Object} appRoles 
     */
   _applyFieldRules(name, mongoRoles, appRoles){
    
    if (this.allowSystemKeyword && this.systemKeyword.has(name)) {
        throw new Error(`Security Exception: Direct declaration of reserved system keyword '${name}' is blocked.`);
    }
        
    const {required,...applicationRole}=appRoles
    
    if(required){
            this.setRequired(name);
        }
       
        this.setProperty(name,{mongoRoles:mongoRoles,appRoles:applicationRole});
   }

/**  string type method */
    string(
        {
            name="",
            attrs={},
            config={required:false}
        }={})
        {
    
        const mongoRoles={
            bsonType: 'string',
            ...(attrs.description && {description: attrs.description }),
            ...(attrs.pattern && {pattern: attrs.pattern }),
            ...(typeof attrs.minLength === 'number' && {minLength: attrs.minLength }),
            ...(typeof attrs.maxLength === 'number' && {maxLength: attrs.maxLength }),
            ...(attrs.enum !== undefined && {enum: attrs.enum }),
        }
        
        const appRoles=this.#applyDefaultconfig(config);
        this._applyFieldRules(name,mongoRoles,appRoles);

      

        return this;
    }

number({
            name="",
            attrs={},
            config={required:false}
        }={})
        {
    
        const mongoRoles={
            bsonType: attrs.type === 'int'? "int" :( attrs.type === "double" ? "double" : "number") ,
            ...(typeof attrs.description === 'string' && {description: attrs.description }),
            ...(typeof attrs.minimum  === 'number' && {minimum : attrs.minimum  }),
            ...(typeof attrs.maximum  === 'number'&& {maximum: attrs.maximum }),
            ...(typeof attrs.exclusiveMinimum  === 'number' && {exclusiveMinimum: attrs.exclusiveMinimum }),
            ...(typeof attrs.exclusiveMaximum  === 'number' && {exclusiveMaximum: attrs.exclusiveMaximum }),
            ...(typeof attrs.multipleOf  === 'number' && {multipleOf: attrs.multipleOf }),
            ...(attrs.enum  && {enum: attrs.enum }),
        }
        
        

      const appRoles=this.#applyDefaultconfig(config);
            this._applyFieldRules(name,mongoRoles,appRoles);
    
    

        return this;
    }

    bool({
            name="",
            attrs={},
            config={required:false}
        }={})
        {
    
        const mongoRoles={
            bsonType: 'bool',
            ...(attrs.description && {description: attrs.description }),
            ...(attrs.enum && {enum: attrs.enum }),
        }
        
        const appRoles=this.#applyDefaultconfig(config);
        this._applyFieldRules(name,mongoRoles,appRoles);
    
    

        return this;
    }

    time({
            name="",
            attrs={},
            config={required:false}
        }={})
        {
    
        const mongoRoles={
            bsonType: 'date',
            ...(attrs.description && {description: attrs.description }),
            ...(typeof attrs.minimum === 'number' && {minimum : attrs.minimum  }),
            ...(typeof attrs.maximum === 'number' && {maximum: attrs.maximum }),
            ...(attrs.enum    !== undefined  &&  {enum: attrs.enum }),
        }
        
         const appRoles=this.#applyDefaultconfig(config);
        this._applyFieldRules(name,mongoRoles,appRoles);
    
    

        return this;
    }

binData({
    name = "",
    attrs = {},
    config = { required: false }
} = {}) {

    const mongoRoles = {
        bsonType: 'binData',
        ...(attrs.description  && { description: attrs.description }),
        ...(typeof attrs.minLength   === 'number'  && { minLength: attrs.minLength }),
        ...(typeof attrs.maxLength   === 'number'  && { maxLength: attrs.maxLength }),
    };

    const appRoles = this.#applyDefaultconfig(config);
    this._applyFieldRules(name, mongoRoles, appRoles);

    return this;
}

object({
    name = "",
    attrs = {},
    config = { required: false }
} = {}) {
    const mongoRoles = {
        bsonType: 'object',
        ...(attrs.description && { description: attrs.description })
    };

    const appRoles = this.#applyDefaultconfig(config);
    this._applyFieldRules(name, mongoRoles, appRoles);

    return this;
}
/**
 * Array type method
 * @param {Object} options
 * @param {string} options.name - Field name
 * @param {Object} options.attrs - Array attributes (minItems, maxItems, uniqueItems, items)
 * @param {Object} options.config - Application roles/config (required, immutable, etc.)
 * @returns {SchemaBuilder}
 */
array({
    name = "",
    attrs = {},
    config = { required: false }
} = {}) {
    const mongoRoles = {
        bsonType: 'array',
        ...(attrs.description && { description: attrs.description }),
        ...(typeof attrs.minItems === 'number' && { minItems: attrs.minItems }),
        ...(typeof attrs.maxItems === 'number' && { maxItems: attrs.maxItems }),
        ...(attrs.uniqueItems !== undefined && { uniqueItems: attrs.uniqueItems }),
        ...(attrs.items && { items: attrs.items })
    };

    const appRoles = this.#applyDefaultconfig(config);
    this._applyFieldRules(name, mongoRoles, appRoles);

    return this;
}
    /**
 * Dynamically adds or updates a specific BSON validation attribute on a field
 * @param {string} propertyName - The target field name (e.g., "age")
 * @param {string} attr - The validation rule attribute (e.g., "minimum")
 * @param {*} value - The validation constraints rule value (e.g., 18)
 */ 
    setMongoPropertyAttribute(name="",attr="",value)
        {
          
          const property=this.getProperty(name);
            if( property && attr && value != undefined && value != null )
                property.mongoRoles[attr]=value;
                   
            return this;

        }

index(keyObject,optionsObject ={}){

     if (keyObject && keyObject?.constructor.name === 'Object') {
              this.setIndexOption(keyObject,optionsObject)
    
}
return this;
}
/**
 * Add deletedAt field in document for time stamp of deletion for soft delete 
 */
deletedAtTimestamps() {
        const systemTimeConfig = { required: true, immutable: true,strictImmutable:true};
        
        this.#applySystemRules(
            "deletedAt",
            { 
                bsonType: 'date',
                description: "Timestamp recording initial record instantiation"
             },
            systemTimeConfig
        );
    
}

/**
 *  
 * add createdAt and updatedAt field in document 
 * @returns {SchemaBuilder} for chaining 
 */
withTimestamps() {
        const systemTimeConfig = { required: true,managedBySystem:{ type: 'date'} };
        
        this.#applySystemRules(
            "createdAt",
            { 
                bsonType: 'date',
                description: "Timestamp recording initial record instantiation"
             },
            { immutable: true,...systemTimeConfig}
        );
         this.#applySystemRules(
            "updatedAt",
            {
                 bsonType: 'date',
                 description: "Timestamp tracking rolling document alterations" 
                },
                { immutable: false,...systemTimeConfig }
            );
        
        return this;
    }
/**
 * add version field in document for OCC (optimisticConcurrencyControl)
 */
withVersionConcurrencyControl(){

    if(frameworkConfig.schemaDefaults.optimisticConcurrencyControl){
 const occConfig = { required: true,select: true };
 this.#applySystemRules("version",{bsonType:'number',description:`this for prevent 2 client from update one document in same time`},occConfig)
    }
}

}




