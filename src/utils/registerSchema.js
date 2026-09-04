import { applicationSchemaRegistry } from "../framework/applicationSchemaRegistry.js";
import { Projection } from "../framework/engines/projectionEngine.js";
import { securityRulesEngine } from "../framework/engines/SecurityRulesEngine.js";

/**
 * 
 * @param {String} collectionName -- collection name like table name eg{product ,user ..etc}
 * @param {*} schemaBuilder -- schema builder instance 
 */
export function registerNewCollection(collectionName,schemaBuilder){
    applicationSchemaRegistry.register(collectionName,schemaBuilder);
    if (Projection.addProjection(collectionName,schemaBuilder)) return true;
    return false;

}


export function addNewCustomManagedBysystem(type,callStratigyFun,param={}){
    try{
        securityRulesEngine.registerCustomCore(type,callStratigyFun,param);
    }catch(err){
        console.error(err.message);
        return false;
    }
    return true;
}