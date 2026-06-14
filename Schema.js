export class Schema {
    constructor({ required = [], properties = {}, indexOption = [] } = {}) {
        this.required = required;
        this.properties = properties;
        this.indexOption = indexOption;

    }
    getProperties() {
        return this.properties;

    }
    getRequired() {
        return this.required;

    }

    getIndex(){
    return this.indexOption;
}

    // add required to required array
    addOneRequired(name) {
        this.required.push(name);
    }

    // adding one property  
    addProperty(name, prop) {
        this.properties[name] = prop;

    }
    // for indexed entry and option 
    addIndexOption(indexKey, indexOpt) {
        this.indexOption.push({ key: indexKey, option: indexOpt });
    }

    // Compiles schema properties into a MongoDB $jsonSchema configuration
    compileValidator() {
        return {
            validator: {
                $jsonSchema: {
                    bsonType: 'object',
                    required: this.required,
                    properties: this.properties
                }
            }
        };
    }

}