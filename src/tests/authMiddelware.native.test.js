import { describe, mock, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb/lib/bson.js';
import { collectionManager } from '../framework/CollectionManager.js';


import { signTokenFromScratch as signToken, verifyTokenFromScratch as verifingToken } from '../utils/jwtEngine.js';
import dotenv from 'dotenv';

dotenv.config();

// mocking steps

const verifyfn = mock.fn(verifingToken);
// mocking verify token function 

mock.module('../utils/jwtEngine.js', {
    exports: {
        verifyTokenFromScratch: verifyfn
        
    }
});


const { tokenauth } = await import('../middleware/authMeddlware.js');

describe("Unit Test: tokenauth Middleware Security Layer", () => {
    let mockUserCollection;
    let req, res, next;
    let token, payload;
    const fakeUserId = new ObjectId().toString();

    beforeEach(() => {
        
        mockUserCollection = {
            findOne: mock.fn(async () => ({ _id: new ObjectId(fakeUserId), username: 'elkas', role: 'admin' }))
        };

        
        mock.method(collectionManager, 'getCollection', async () => {
            return mockUserCollection;
        });

        
        payload = {
            id: fakeUserId,
            role: 'admin'
        };
        token = "abcd.1325.abcd"

        verifyfn.mock.mockImplementation(()=> ({id:fakeUserId,role:'admin'}));

        
        req = {
            headers: { authorization: `Bearer ${token}` }
        };
        res = {};
        next = mock.fn();
    });

    afterEach(() => {
        // reset all mock after each iterate
        verifyfn.mock.resetCalls();
        mockUserCollection.findOne.mock.resetCalls();
        next.mock.resetCalls();
    });

    
    describe("Successfuly Authentication ", () => {
        test('should authenticate valid token and attach user to req', async () => {
            await tokenauth(req, res, next);

            
            assert.equal(next.mock.calls.length, 1);
            assert.equal(next.mock.calls[0].arguments.length, 0);

            
            assert.equal(verifyfn.mock.calls.length, 1);
            assert.equal(verifyfn.mock.calls[0].arguments.length, 2);

            
            assert.equal(req.user.username, 'elkas');
            assert.equal(mockUserCollection.findOne.mock.calls.length, 1);
        });
    });

    
    describe("Edge Cases : Authentication Failure", () => {
        
        test("should halt pipeline with 401 AppError if Authorization header is missing", async () => {
            req.headers = {}; 

            await tokenauth(req, res, next);

            assert.equal(next.mock.calls.length, 1);
            const thrownError = next.mock.calls[0].arguments[0];
            assert.equal(thrownError.statusCode, 401);
            assert.match(thrownError.message, /not have token/i);
        });

        test("should fail with status code 401 if the JWT token is expired Or Corrupted", async () => {
            
            verifyfn.mock.mockImplementationOnce(()=>{
                throw new Error(`Token has expired`);
            });

            req.headers.authorization = `Bearer ${token}`;

            await tokenauth(req, res, next);

            assert.equal(next.mock.calls.length, 1);
            const thrownError = next.mock.calls[0].arguments[0];
            assert.equal(thrownError.statusCode, 401);
            assert.match(thrownError.message, /have token but not verify/i); 
        });

        test("should fail with status code 401 if the token is valid but the user no longer exists in DB", async () => {
            mockUserCollection.findOne.mock.mockImplementationOnce(async () => null);

            await tokenauth(req, res, next);

            assert.equal(next.mock.calls.length, 1);
            assert.equal(next.mock.calls[0].arguments[0].statusCode, 401);
            assert.match(next.mock.calls[0].arguments[0].message, /no longer exist/i);
        });

        
              

        test("should forward error to next() if Db Failed during findOne inquiry", async () => {
            
            mockUserCollection.findOne = mock.fn(async () => {
                throw new Error("MongoNetworkError: Connection refused");
            });
            req.headers.authorization = `Bearer ${token}`;

            await tokenauth(req, res, next);

            
            assert.equal(next.mock.calls.length, 1);
            const thrownError = next.mock.calls[0].arguments[0];
            assert.match(thrownError.message, /Connection refused/);
        });
    });
});
