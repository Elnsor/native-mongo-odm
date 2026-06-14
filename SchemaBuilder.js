import { Schema } from "./Schema.js";

export class SchemaBuilder extends Schema {

    constructor(definition = {}) {
        super(definition);

        this.propertyName = "";

    }

/**  string type method */
    string(name){
    
        const propertyType= {bsonType: 'string'};

        this.addProperty(name,propertyType);
        this.addOneRequired(name);
    

        return this;
    }

number(name){
    
        const propertyType= {bsonType: 'number'};

        this.addProperty(name,propertyType);
        this.addOneRequired(name);
    

        return this;
    }

index(keyObject,optionsObject ={}){

    this.addIndexOption(keyObject,optionsObject)
    return this;
}

    
    
}



