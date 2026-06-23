import { describe, test, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getDb as OriginalGetDb } from "../config/db.js";
import { SchemaBuilder } from "../framework/SchemaBuilder.js";


const mockGetDb = mock.fn(OriginalGetDb)

let mockCollectionObj = {
    drop: mock.fn(() => Promise.resolve(true)),
    createIndex: mock.fn(async () => ({ success: true }))
};


let mockdb = {
    createCollection: mock.fn(async () => mockCollectionObj),
    collection: mock.fn(() => mockCollectionObj),
    listCollections: mock.fn(() => ({
        toArray: async () => []
    }))
};


mockGetDb.mock.mockImplementation(() => mockdb);

mock.module("../config/db.js", {
    exports: {
        getDb: mockGetDb,
    }
});

const { collectionManager } = await import(`../framework/CollectionManager.js?update=${Date.now()}`);

describe("Unit Test: Collection Manager", () => {
    let schemasample;

    beforeEach(() => {

        collectionManager.cache = {};
        collectionManager.current = null;


        schemasample = new SchemaBuilder();
        schemasample.string({ name: "username", config: { required: true } });
        schemasample.setIndexOption({ username: 1 }, { unique: true });
    });

    afterEach(() => {

        mockCollectionObj.createIndex.mock.resetCalls();
        mockCollectionObj.drop.mock.resetCalls();
        mockdb.createCollection.mock.resetCalls();
        mockdb.listCollections.mock.resetCalls();
        mockdb.collection.mock.resetCalls();


        mockdb.listCollections.mock.mockImplementation(() => ({ toArray: async () => [] }));
        mockCollectionObj.drop.mock.mockImplementation(() => Promise.resolve(true));
    });

    describe("Core Functionalities : ", () => {

        describe("Gevin : Create new Collection users ", () => {
            test("shoud create New collection name users with indexed and update caches", async () => {
                const collName = "users";
                const result = await collectionManager.createCollection(collName, schemasample);

                assert.equal(mockdb.createCollection.mock.calls.length, 1);
                const CArgs = mockdb.createCollection.mock.calls[0].arguments;

                assert.equal(CArgs[0], collName);
                assert.deepStrictEqual(CArgs[1].validator.$jsonSchema.bsonType, 'object');

                assert.equal(mockCollectionObj.createIndex.mock.calls.length, 1);
                assert.deepStrictEqual(mockCollectionObj.createIndex.mock.calls[0].arguments[0], { username: 1 });

                assert.deepEqual(collectionManager.cache[collName], mockCollectionObj);
                assert.equal(collectionManager.current, collName);
                assert.equal(result, mockCollectionObj);
            });
        });

        describe("Gevin : Get Collection From Cache ", () => {
            test("shoud retun collection from cache immediatly if collection already in the cache ", async () => {
                const collName = "products";


                mockdb.listCollections.mock.mockImplementationOnce(() => ({
                    toArray: async () => [{ name: collName }]
                }));

                await collectionManager.createCollection(collName, schemasample);
                const result = await collectionManager.createCollection(collName, schemasample);


                assert.equal(mockdb.listCollections.mock.calls.length, 1);
                assert.equal(result, mockCollectionObj);
            });
        });

        describe("Gevin : Drop Collection ", () => {
            test("shoud drop it from caches and drop return true ", async () => {
                const collName = "logs";
                collectionManager.cache[collName] = mockCollectionObj;
                collectionManager.current = collName;

                const drop = await collectionManager.dropCollection(collName);

                assert.equal(drop, true);
                assert.equal(mockCollectionObj.drop.mock.calls.length, 1);
                assert.equal(collectionManager.cache[collName], undefined);
                assert.equal(collectionManager.current, null);
            });
        });
    });

    describe("Edge Cases : add index ", () => {

        describe("Gevin : Add new index for not exsist field ", () => {
            test("shoud not accepted and throw error", async () => {
                const collName = "users";
                schemasample.setIndexOption({ email: 1 }, { unique: true });

                await assert.rejects(
                    async () => {
                        await collectionManager.createCollection(collName, schemasample);
                    },
                    (err) => {
                        assert.match(err.message, /XX Schema Compilation Error/i);
                        return true;
                    }
                );

                assert.equal(mockdb.createCollection.mock.calls.length, 0);
            });
        });

        describe("Gevin : Drop Non Exist Collection ", () => {
            test("shoud drop return false", async () => {
                mockCollectionObj.drop.mock.mockImplementationOnce(() => {
                    throw new Error("MongoServerError: ns not found");
                });

                const collName = "dummy";
                const drop = await collectionManager.dropCollection(collName);

                assert.equal(drop, false);
            });
        });

        describe("Gevin : listCollection faild inside getCollection ", () => {
            test("shoud throw connection error ", async () => {
                mockdb.listCollections.mock.mockImplementationOnce(() => {
                    throw new Error("Fatal DB Connection Lost");
                });

                await assert.rejects(
                    async () => {
                        await collectionManager.getCollection("dummy_collection");
                    },
                    (err) => {
                        assert.match(err.message, /Fatal DB Connection Lost/);
                        return true;
                    }
                );
            });
        });
    });
});
