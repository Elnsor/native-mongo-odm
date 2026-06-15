import { getDb } from "../config/db.js";

class CollectionManager{
    constructor(){
        this.cache={};
        this.current=null;
    }
/**
 * 
 * @param {String} collectionName -- new collection name 
 * @param {Schema} SchemaValidatorObject -- Schema Object
 * @param {boolean} update -- if update = true then it allow to update exist collection with same name 
 * @returns {Promis<Collection>}
 */
    async createCollection(collectionName,SchemaValidatorObject,update=false){
       
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
     * 
     * @param {String} collectionName 
     * @returns {Promise<boolean>}
     *  this Operation can reset the collection selection
     *  better to select new collection to work on it after drop 
     */

    async dropCollection(collectionName){
        const db = getDb();
        try {
            await db.collection(collectionName).drop();
            console.log(`💥 Collection '${collectionName}' dropped cleanly.`);

            if(this.cache[collectionName]){
                delete this.cache[collectionName]
            }

            if(this.current === collectionName ){
                this.current=null
            }
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

    getCollectionCache(){
        return this.cache;

    }
    getCurrentCollection(){
        return this.current;

    }

     /**
      * 
      * @param {String} collectionName 
      * @returns {Promise<collecionName|null>}
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
}

export const collectionManager= new CollectionManager();