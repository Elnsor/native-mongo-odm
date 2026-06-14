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

    // set required to required array
    setRequired(name) {
        if(!this.required.includes(name))
            this.required.push(name)
    }

    // seting  property  
    setProperty(name, prop) {
        this.properties[name] = prop;

    }
    // geting  property by name 
    getProperty(name=""){
        return this.properties[name]
    }
    // for indexed entry and option 
    setIndexOption(indexKey, indexOpt) {
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