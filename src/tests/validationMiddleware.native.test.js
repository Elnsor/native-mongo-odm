import { describe, mock, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { schemaManager } from '../validation/schemaManager.js';

// Import the middleware under test
import validationCollection from '../middleware/validate.js';


describe("Unit Test: validationCollection Middleware", () => {
    let req, res, next;
    const fakeCleanBody = { username: 'elkas_sanitized' };

    beforeEach(() => {
        // return fake clean user 
        mock.method(schemaManager, 'validateDocument', async () => {
            return fakeCleanBody;
        });

        // semulate request 
        req = {
            params: { collectionName: 'users' },
            method: 'POST',
            body: { username: '  elkas_dirty  ' }
        };
        res = {};
        next = mock.fn();
    });

    afterEach(() => {
        mock.reset();
    });

    describe("Ckeck request body and method ", () => {
        test("should handle POST request and pass isUpdate as false", async () => {
            await validationCollection(req, res, next);

            const spyCalls = schemaManager.validateDocument.mock.calls;
            assert.equal(spyCalls.length, 1);

            // isUpdate must be false
            assert.strictEqual(spyCalls[0].arguments[0], 'users');
            assert.strictEqual(spyCalls[0].arguments[3], false);

            // checking req.body was updated with clean result and valid
            assert.deepStrictEqual(req.body, fakeCleanBody);
            assert.equal(next.mock.calls.length, 1);
            assert.equal(next.mock.calls[0].arguments.length, 0); // next() called with no errors
        });

        test("should detect PATCH/PUT request and pass isUpdate as true", async () => {
            req.method = 'PATCH';

            await validationCollection(req, res, next);

            const spyCalls = schemaManager.validateDocument.mock.calls;
            assert.strictEqual(spyCalls[0].arguments[3], true); // isUpdate must be true
            assert.equal(next.mock.calls.length, 1);
        });

        test("should forward validation errors to next() via catchAsync wrapper", async () => {

            schemaManager.validateDocument.mock.mockImplementationOnce(async () => {
                throw new Error("Validation Failed: Missing required schema fields");
            });

             schemaManager.validateDocument.mock.mockImplementationOnce(async () => {
                throw new Error("Validation Failed: Missing required schema fields");
            });

             const errorPromise = new Promise((resolve) => {
                next = mock.fn((err) => {
                    resolve(err); // 
                });
            });

            await validationCollection(req, res, next);


           const receivedError = await errorPromise;

            assert.equal(next.mock.calls.length, 1);
            assert.match(receivedError.message, /Missing required schema fields/)

        });
    });// end inner describe
});
