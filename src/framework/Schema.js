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
        
        // i can add new feature her like add dynamic timestap like createdAt or updatedAt or any dynamic field

        for (const userIndex of this.getIndex()) {
        const indexKeys = Object.keys(userIndex.key);
        for (const key of indexKeys) {
            if (!this.properties[key]) {
                throw new Error(`XX Schema Compilation Error: Cannot create an index on "${key}" because it does not exist in definitions!`);
            }
        }
    }
        
// validator: {
//         // i can combine our standard JSON schema with expression rules using $and
//         $and: [
//             // 1. standard schema validator (Approach 1)
//             { $jsonSchema: { bsonType: "object", properties: { ... } } },

//             // 2.  and some restriction check for field doing by mongodbserver 
//             {
//                 $expr: {
//                     // Rule: "createdAt" must be less than or equal to ($lte) "updatedAt"
//                     $lte: [ "$createdAt", "$updatedAt" ]
//                 }
//             }
//         ]
//     }
// };

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