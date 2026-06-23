import { describe, test, mock, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { ObjectId } from 'mongodb/lib/bson.js'



let collectionObject = {
    insertOne: mock.fn(async function () { return { insertedId: "mocked_username_id" } }),
    find: mock.fn(() => ({
        toArray: async () => [{ username: 'elkas' }]
    })),
    findOne: mock.fn(async () => ({ _id: new ObjectId(), username: 'elkass' })),
    deleteOne: mock.fn(async () => ({ deletedCount: 1 })),
    updateOne: mock.fn(async () => ({ updateCount: 1, modifiedCount: 1 }))
};

let mockCollectionManager = {
    getCollectionCache: mock.fn(function () {
        return { users: collectionObject };
    })
}
mock.module('../framework/CollectionManager.js', {
    exports: {
        collectionManager: mockCollectionManager
    }
})

const { BaseController } = await import('../framework/BaseController.js')

describe("", () => {
    let req, res, next;
    const controller = new BaseController('users')
    beforeEach(() => {


        req = {
            body: { username: 'elkas' },
            params: {
                collectionName: 'users',
                id: new ObjectId().toString()
            }
        };

        res = {
            status: mock.fn(function () { return this; }),
            json: mock.fn(function () { return this; }),
        }

        next = mock.fn();





    });//befor 
    afterEach(() => {
        mock.restoreAll();
    });//after

    describe("gevin: create() : to insert Doc", () => {

        test("should insert and return HTTP status Code 201", async () => {

            assert.deepEqual(req.body, { username: 'elkas' })
            await controller.create(req, res, next);
            assert.equal(collectionObject.insertOne.mock.calls.length, 1);
            assert.deepEqual(collectionObject.insertOne.mock.calls[0].arguments[0], req.body);
            assert.equal(res.status.mock.calls[0].arguments[0], 201);
        })
    }); // end describe 

    describe("gevin: findAll() : to find Docs", () => {

        test("should find mapped collection array  and return HTTP status Code 200", async () => {
            await controller.findAll(req, res, next);

            assert.equal(collectionObject.find.mock.calls.length, 1);

            assert.equal(res.status.mock.calls[0].arguments[0], 200);
        })
    }); // end describe

    describe("gevin: findById() : to insert Doc", () => {

        test("should parse hex lookup and return the matched document with HTTP status Code 200", async () => {
            await controller.findById(req, res, next);
            assert.equal(collectionObject.findOne.mock.calls.length, 1);
            assert.deepEqual(collectionObject.findOne.mock.calls[0].arguments[0], { _id: new ObjectId(req.params.id) });
            assert.equal(res.status.mock.calls[0].arguments[0], 200);
        })
    }); // end describe 

    describe("given: update() : to modify an active Doc", () => {
        test("should intercept payload modifications and alter DB record arrays", async () => {
            await controller.update(req, res, next);

            assert.equal(collectionObject.updateOne.mock.calls.length, 1);
            assert.equal(res.status.mock.calls[0].arguments[0], 200);
        });
    });

    describe("given: remove() : to delete Doc", () => {
        test("should dorp routing safly and delete Doc with matching Id", async () => {
            await controller.remove(req, res, next);

            assert.equal(collectionObject.deleteOne.mock.calls.length, 1);
            assert.equal(res.status.mock.calls[0].arguments[0], 200);
        });
    });

    describe("Edge Case: findById() with non-existent ID", () => {
        test("should forward a 404 error via next() if document is not found", async () => {

            collectionObject.findOne.mock.mockImplementationOnce(async () => null);

            await controller.findById(req, res, next);

            assert.equal(next.mock.calls.length, 1);
            const error = next.mock.calls[0].arguments[0];
            assert.equal(error.statusCode, 404);
        });
    });

    describe("Edge Case: findById() with malformed hex string", () => {
        test("should catch ObjectId parsing errors and forward via next()", async () => {

            req.params.id = "broken-id-123";

            await controller.findById(req, res, next);

            assert.equal(next.mock.calls.length, 1);
            const error = next.mock.calls[0].arguments[0];
            assert.ok(error instanceof Error);
        });

    });

    describe("Edge Case: update() on a non-existent record", () => {
        test("should forward 404 error if update target matches zero records", async () => {

            collectionObject.updateOne.mock.mockImplementationOnce(async () => ({
                matchedCount: 0,
                modifiedCount: 0
            }));

            await controller.update(req, res, next);

            assert.equal(next.mock.calls.length, 1);
            const error = next.mock.calls[0].arguments[0];
            assert.equal(error.statusCode, 404);
        });
        test("should return 400 if the provided update ID is invalid", async () => {
            req.params.id = "bad-id-123";

            await controller.update(req, res, next);

            assert.equal(next.mock.calls.length, 1);
            const error = next.mock.calls[0].arguments[0];
            assert.equal(error.statusCode, 400);
            assert.match(error.message, /24 character hex/i);
        });
    });

    describe("Edge Case: remove() on a non-existent record", () => {
        test("should forward 404 error if delete target matches zero records", async () => {


            collectionObject.deleteOne.mock.mockImplementationOnce(async () => ({
                deletedCount: 0
            }));

            await controller.remove(req, res, next);

            assert.equal(next.mock.calls.length, 1);
            const error = next.mock.calls[0].arguments[0];
            assert.equal(error.statusCode, 404);
        });
        test("should return 400 if the provided delete ID is invalid", async () => {
            req.params.id = "invalid-id-xyz";

            await controller.remove(req, res, next);

            assert.equal(next.mock.calls.length, 1);
            const error = next.mock.calls[0].arguments[0];
            assert.equal(error.statusCode, 400);
        });
    });


});//desribe outer 
