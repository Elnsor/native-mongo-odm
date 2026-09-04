import { Collection, Db } from "mongodb";
import { getDb } from "../config/db.js";
import { applicationSchemaRegistry } from "./applicationSchemaRegistry.js";
import { Projection } from "./engines/projectionEngine.js";

export class CollectionManager{
    constructor(){
        this.cache={};
        this.current=null;
    }
/**
 * updated -
 * 1- Collection must be registered first before its create physicly 
 * if not register throw error 
 * 
 * if collection with same name exist in dbserver return its return CollectionObject without any new creation \
 * if not exist collection with same name  in dbserver its create new one and retrun its CollectionObject
 * in both it put CollectionObject in Cache
 * if its faild => error 
 * @param {String} collectionName -- new collection name 
 * @param {Schema} SchemaValidatorObject -- Schema Object
 * @param {boolean} update -- if update = true then it allow to update exist collection with same name 
 * @returns {Promis<Collection|Error>}
 */
    async createCollection(collectionName,SchemaValidatorObject,update=false){
       
        if(! applicationSchemaRegistry.isRegister(collectionName) ){
            throw new Error("CollectionError: you must register your schema first !!"); 
        }
    /**
     * @type {Db}
     */
        const db=getDb();

        const collectionObject=await this.getCollection(collectionName);

        if(collectionObject){
         this.cache[collectionName]=collectionObject;
            return collectionObject;
        }
// the collection does not exist

        try {

        const compileValidator = SchemaValidatorObject.compileValidator();

        const newCollectionObject = await db.createCollection(collectionName, compileValidator);

        

        for (const userIndex of SchemaValidatorObject.getIndex()) {
            

            const { key, option } = userIndex;
            await newCollectionObject.createIndex(key, option);
        }

        console.log(`collection name ${collectionName} is created with schema Validation Rule and Indexed`);
        this.cache[collectionName]=newCollectionObject;
        this.current = collectionName;
        return newCollectionObject;

    } catch (error) {
        console.error(`❌ Something went wrong when creating collection: ${collectionName}`, error);
            throw error; 


    }


    }

    /**
 * this new version of createCollection method 
 * its take collection name and update
 * its fetch collection schema from its registerd class if its not registerd it dont create 
 * @param {String} collectionName -- new collection name 
 * @param {boolean} update -- if update = true then it allow to update exist collection with same name 
 * @returns {Promis<Collection|Error>}
 */
    async createCollectionv1(collectionName,update=false){
       
        if(! applicationSchemaRegistry.isRegister(collectionName) ){
            throw new Error("CollectionError: you must register your schema first !!"); 
        }
    
        const db=getDb();

        const collectionObject=await this.getCollection(collectionName);

        if(collectionObject && ! update){
         this.cache[collectionName]=collectionObject;
            return collectionObject;
        }
// the collection does not exist

        try {
            const schemaBuilder = applicationSchemaRegistry.getSchema(collectionName);

        const compileValidator = schemaBuilder.compileValidator();

        if(!collectionObject){

             collectionObject = await db.createCollection(collectionName, compileValidator);
             console.log(`new Collection ${collectionName} is Created with Native validator`)
            
            }else if (update){

                await db.runCommand({
                collMod: collectionName,
                validator: compileValidator.validator
            });

            console.log(`⚡ Collection '${collectionName}' native validators updated via collMod.`);
            }

        for (const userIndex of schemaBuilder.getIndex()) {
            

            const { key, option } = userIndex;
            await collectionObject.createIndex(key, option);
        }

        console.log(`collection name ${collectionName} is created with schema Validation Rule and Indexed`);
        this.cache[collectionName]=collectionObject;
        this.current = collectionName;
        return collectionObject;

    } catch (error) {
        console.error(`❌ Something went wrong when creating collection: ${collectionName}`, error);
            throw error; 


    }


    }

    /**
     * 
     * @param {String} collectionName 
     * @returns {Promise<boolean>}
     *  this Operation can reset the collection selection
     *  better to select new collection to work on it after drop 
     * its remove the collection Object from cache and unregisterd it 
     */

    async dropCollection(collectionName){
        const db = getDb();
        try {
        
           const collections = await db.listCollections({ name: collectionName }).toArray();
        if (collections.length > 0) {
            await db.collection(collectionName).drop();
            console.log(`🗑️ Physical MongoDB collection '${collectionName}' dropped successfully.`);
        }

            if(this.cache[collectionName]){
                delete this.cache[collectionName]
            }

            if(this.current === collectionName ){
                this.current=null
            }
            applicationSchemaRegistry.unregister(collectionName);
            return true;
        } catch (err) {
            // Collection didn't exist, ignore error safely
            console.error(`Drop collection Error ${err.message}`);
            return false;
        }
    }


    /**
     *
     * @param {String} collecionName 
     * select the collection by collection name and make it current collection if not current not modified
     * @returns {Promise<Collection|null>} 
     *  
     */
     async selectCollection(collecionName){
        const collectionObject=await this.getCollection(collecionName);
        if(collectionObject) this.current=collecionName;
        return collectionObject;


    }
/**
 * 
 * @returns {Object} collection cache 
 */
    getCollectionCache(){
       
        return this.cache;
        

    }
    /**
     * 
     * @returns current collecton selected 
     */
    getCurrentCollection(){
        return this.current;

    }

     /**
      * try to get CollectionObject By name from cache and return it , if not found \
      * try to get from dbserver return it and put it in cache , not found
      * return null 
      * @param {String} collectionName 
      * @returns {Promise<Collection|null>}
      */ 
    async getCollection(collectionName) {

        

        if (this.cache[collectionName]) {
            return this.cache[collectionName];

        } 

            const db = getDb();

            try {
                const collection = await db.listCollections({ name: collectionName }).toArray();
                if (collection.length > 0) {
                   const collObject = db.collection(collectionName);
                    this.cache[collectionName] = collObject;
                    return collObject;
                } 
            } catch (error) {

                console.error("Error: Fetching Collection From Database Faild");
                throw error;

            }
        
return null;
}
/**
 * 
 * @returns {Array} - return all collection in dbserver
 */
async getAllCollection(){
 const db = getDb();
 try {
                const collection = await db.listCollections().toArray();
                return collection;
            } catch (error) {

                console.error(`Error: Fetching Collection From Database Faild: ${error.message} `);
                return null;

            };




}
/**
 * new function its used to sync all like cache registerd schema and dbserver 
 * its iterate over all registered schema for each one if its exist in dbserver its apply db update command 
 * if not exist in dbserver its create new collection in db 
 * this function is used when system is reboot or after maintanance or server is down for while then come back again 
 * 
 * @param {applicationSchemaRegistry} registerInstanc -- contain all static schema  
 */

async syncAllCollectionOnBoot(registerInstanc){
    const db=getDb();

    const collectionList= await this.getAllCollection();
    const collectionListName=new Set(collectionList.map(c=> c.name));

    const schemaRegistry=[...registerInstanc.getAllSchema()];

    for(let i=0 ; i<schemaRegistry.length; i++){

        const [schemaName,schemaClass]=schemaRegistry[i];
        console.log("schema",schemaName)
        Projection.addProjection(schemaName,schemaClass);
        const schemaCompiled=schemaClass.compileValidator();
      
        if (!collectionListName.has(schemaName)){
            await db.createCollection(schemaName,schemaCompiled);
        }else{
            await db.command({ collMod: schemaName, validator: schemaCompiled.validator })
        }

        const collectionObject=db.collection(schemaName);

        for (const userIndex of schemaClass.getIndex()) {
            

            const { key, option } = userIndex;
            await collectionObject.createIndex(key, option);
        }
        this.cache[schemaName]=collectionObject


    }




}


}



export const collectionManager= new CollectionManager();