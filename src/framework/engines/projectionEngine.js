
import { schemaManager } from "../../validation/schemaManager.js";
import { SchemaBuilder } from "../SchemaBuilder.js";




export class Projection{
    static cache=new Map();
    constructor(){
        
    }
    /**
 * @param {Request} req 
 * 
 * @param {SchemaBuilder} schemaBuilder
 * @returns {object} projection 
 */
   static addProjection(collectionName,schemaBuilder){
       
    
    if (this.cache.has(collectionName)) return this.cache.get(collectionName);
     
    // 1. Get your compiled schema from your schema manager registry
    const schema = schemaBuilder.getProperties();
    
    
    if (!schema) return {};
     

    const projection = {};

    // 2. Loop through all fields to check for select rules
    for (const [fieldName, fieldConfig] of Object.entries(schema)) {
        const appRoles = fieldConfig.appRoles;
        
        
        // If select is explicitly set to false, hide it by default!
        if (appRoles && appRoles.select === false) {
            projection[fieldName] = 0; // 0 tells the native driver: "Do NOT return this field"
        }
    }
    this.cache.set(collectionName,projection);

    return projection;

    }
/**
 * 
 * @param {string} collectionName -- name of the collection
 * @returns {object} projection
 */
static getProjection(collectionName){
    return this.cache.get(collectionName);

}



}
