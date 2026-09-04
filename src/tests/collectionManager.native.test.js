
import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';

import { SchemaBuilder } from '../framework/SchemaBuilder.js';
import { applicationSchemaRegistry } from '../framework/applicationSchemaRegistry.js';
import {getDb, getDb as originalGetDb}  from '../config/db.js';


const mockGetDb=mock.fn(originalGetDb);

 let mockdb={
            listCollections: ()=>({
                toArray: async()=> [{name: 'logs'}] 
            }),
            collection: ()=> mockCollection
        }
mockGetDb.mock.mockImplementation(()=> mockdb);
 
let mockCollection={
            drop: async()=> true
        }


mock.module('../config/db.js',{
    exports:{
        getDb : mockGetDb
    }
})

const {CollectionManager} = await import('../framework/CollectionManager.js')
describe("Unit Test Suite: CollectionManager", () => {
    let collectionManager;

    beforeEach(() => {
        /**
         * @type {CollectionManager}
         */
        collectionManager = new CollectionManager();
        if (applicationSchemaRegistry.isRegister("logs")) {
            applicationSchemaRegistry.unregister("logs");
        }
        if (applicationSchemaRegistry.isRegister("users")) {
            applicationSchemaRegistry.unregister("users");
        }
    });

    it("should throw an error if collection creation is attempted without prior schema registration", async () => {
        const builder = new SchemaBuilder("users");

        await assert.rejects(async () => {
            await collectionManager.createCollectionv1("users", false);
        }, /CollectionError: you must register your schema first !!/);
    });

    it("should correctly handle collection cache retrieval and current collection tracking", async () => {
        const dummyCollection = { collectionName: "users" };
        collectionManager.cache["users"] = dummyCollection;
        collectionManager.current = "users";

        const cachedCollection = collectionManager.getCollectionCache();
        const currentSelected = collectionManager.getCurrentCollection();

        assert.deepStrictEqual(cachedCollection, { users: dummyCollection });
        assert.strictEqual(currentSelected, "users");
    });

    it("should select collection and update current state if collection exists in cache", async () => {
        const dummyCollection = { collectionName: "logs" };
        collectionManager.cache["logs"] = dummyCollection;

        // Mocking getCollection internal flow or testing cache hit scenario via selectCollection
        // Note: selectCollection delegates to getCollection which checks cache first
        const result = await collectionManager.selectCollection("logs");
        assert.strictEqual(collectionManager.getCurrentCollection(), "logs");
    });

    it("should properly unregister schema and clear cache when dropping a collection", async () => {
        const builder = new SchemaBuilder("logs")
            .string({ name: "message", config: { required: true } });

        applicationSchemaRegistry.register("logs", builder);
        collectionManager.cache["logs"] = { name: "logs" };
        collectionManager.current = "logs";

        assert.strictEqual(applicationSchemaRegistry.isRegister("logs"), true);
       
       const result= await collectionManager.dropCollection("logs");

        assert.strictEqual(result,true);
        assert.strictEqual(applicationSchemaRegistry.isRegister("logs"), false);
        assert.strictEqual(collectionManager.getCollectionCache()["logs"], undefined);
        assert.strictEqual(collectionManager.getCurrentCollection(), null);
    });
});