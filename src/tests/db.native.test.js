import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import {MongoMemoryServer} from 'mongodb'
import { connectDb, getDb, closeDb } from "./db.js"; 

describe("MongoDB Connection Integration Tests", () => {
  let mongoServer;

  before(async () => {

    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();

    
    process.env.MONGODB_URI = uri;
  });

  after(async () => {

    await closeDb();
    await mongoServer.stop();
  });

  test("Should establish a real connection to MongoDB memory server", async () => {
    const db = await connectDb();
    assert.ok(db, "Database instance should be defined");
    
    
    const testCollection = db.collection("test_collection");
    const result = await testCollection.insertOne({ name: "Elnsor Test" });
    
    assert.ok(result.insertedId, "Document should have an insertedId");
  });

  test("getDb should return the active database instance", () => {
    const db = getDb();
    assert.ok(db.databaseName, "Database name should be accessible");
  });

  test("Should close connection cleanly", async () => {
    
    await assert.doesNotReject(async () => {
      await closeDb();
    }, "closeDb should not throw any errors");
  });
});