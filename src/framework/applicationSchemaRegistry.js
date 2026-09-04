import { AppError } from "./appError.js";




/** registry schema  meaning save our schema application property in Memory (cached) */

class ApplicationSchemaRegistry{
    constructor(){
        this.registry= new Map();
    }

/**
 * 
 * @param {String} collectionName - collection name 
 * @param {Object} schemaInstance - Instance of the SchemaBuilder class 
 */
    register(collectionName,InstansSchemaBuilder){

        if(this.registry.has(collectionName)){
            throw new AppError(`Framework Error: Schema for collection '${collectionName}' is already registered.`, 500)
        };

        this.registry.set(collectionName,InstansSchemaBuilder);


    }

    isRegister(collectionName){
        return this.registry.has(collectionName)
    }

    /**
     * 
     * @param {string} collectionName - collection name 
     * @returns {Object} The complete SchemaBuilder configuration instance
     */

    getSchema(collectionName){

        const schema = this.registry.get(collectionName);
        if (!schema) {
            throw new AppError(`Routing Error: Collection configuration for '${collectionName}' does not exist in the memory registry.`, 404);
        }
        return schema;
    }

    /**
     * 
     * @returns {Array} of entries each element is in [collectionName,SchemaBuilder configuration instance]
     */
    getAllSchema(){
        return this.registry.entries();
    }
unregister(collecionName){

    this.registry.delete(collecionName);

}
    
}

export const applicationSchemaRegistry= new ApplicationSchemaRegistry();

