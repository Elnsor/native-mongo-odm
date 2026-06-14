import { Schema } from "./Schema.js";

export class SchemaBuilder extends Schema {

    constructor(definition = {}) {
        super(definition);

        this.propertyName = "";

    }

/**  string type method */
    string(
        {
            name="",
            attrs={},
            config={required:false}
        }={})
        {
    
        const opt={
            bsonType: 'string',
            ...(attrs.description && {description: attrs.description }),
            ...(attrs.pattern && {pattern: attrs.pattern }),
        }
        
        

        this.setProperty(name,opt);
        if(config.required)
        this.setRequired(name);
    

        return this;
    }

number({
            name="",
            attrs={},
            config={required:false}
        }={})
        {
    
        const opt={
            bsonType: attrs.type === 'int'? "int" :( attrs.type === "double" ? "double" : "number") ,
            ...(attrs.description && {description: attrs.description }),
            ...(attrs.minimum && {minimum : attrs.minimum  }),
            ...(attrs.maximum && {maximum: attrs.maximum }),
        }
        
        

        this.setProperty(name,opt);
        if(config.required)
        this.setRequired(name);
    
    

        return this;
    }

    bool({
            name="",
            attrs={},
            config={required:false}
        }={})
        {
    
        const opt={
            bsonType: 'bool',
            ...(attrs.description && {description: attrs.description }),
        }
        
        this.setProperty(name,opt);
        if(config.required)
        this.setRequired(name);
    
    

        return this;
    }

    time({
            name="",
            attrs={},
            config={required:false}
        }={})
        {
    
        const opt={
            bsonType: 'date',
            ...(attrs.description && {description: attrs.description }),
        }
        
        this.setProperty(name,opt);
        if(config.required)
        this.setRequired(name);
    
    

        return this;
    }

    /**
 * Dynamically adds or updates a specific BSON validation attribute on a field
 * @param {string} propertyName - The target field name (e.g., "age")
 * @param {string} attr - The validation rule attribute (e.g., "minimum")
 * @param {*} value - The validation constraints rule value (e.g., 18)
 */ 
    setPropertyAttribute(name="",attr="",value)
        {
          
          const property=this.getProperty(name);
            if( property && attr && value != undefined && value != null )
                property[attr]=value;
                   
            return this;

        }

index(keyObject,optionsObject ={}){

     if (keyObject && keyObject?.constructor.name === 'Object') {
            const keys=Object.keys(keyObject)
            
            for(const key of keys ){
                if(!this.getProperties()[key]) 
                  throw new Error(`XX Schema Compilation Error: Cannot create an index on "${key}" because it does not exist in your schema definition!`)

            }
    this.setIndexOption(keyObject,optionsObject)
    return this;
}

    
    
}
}



