import {mock, test, beforeEach, afterEach, describe} from 'node:test'
import assert from 'node:assert/strict';
import { AppError } from "../framework/appError.js";
import { collectionManager } from "../framework/CollectionManager.js";
import { schemaManager } from "../validation/schemaManager.js";
import { securityRulesEngine } from "../framework/engines/SecurityRulesEngine.js";
import {hashPassworNative as hashpass} from "../utils/helperhash.js";
import {signTokenFromScratch as signToken, signTokenFromScratch}  from "../utils/jwtEngine.js";

import { getDb } from '../config/db.js';

const signing=mock.fn(signToken);
const hashing=mock.fn(hashpass);


let mockcollObj;
let orignalDocumentValidate;
let orignalGetCollectionCache;
let orignalEvalRole ;
let orignalHash;
let orignalSignToken;
let mockgetDb;

mock.module("../utils/jwtEngine.js",{
    exports:{
        signTokenFromScratch:signing
    }
})

mock.module("../utils/helperhash.js",{
    exports:{
       hashPassworNative:hashing
    }
})

const {userService} =await import("../services/UserService.js");

describe ("TEST userSerivce",()=>{
    beforeEach(()=>{
        // reset user collection
        userService.userCollection=null 
        

        mockcollObj={
            findOne:mock.fn(),
            insertOne:mock.fn(),
        };

        orignalDocumentValidate=schemaManager.validateDocument;
        orignalGetCollectionCache=collectionManager.getCollectionCache;
        orignalEvalRole=securityRulesEngine.evalRoles
      
        

        schemaManager.validateDocument=mock.fn((collection,data)=> Promise.resolve(data))
       
        securityRulesEngine.evalRoles=mock.fn((collection,data)=> Promise.resolve(data));
        
        
        hashing.mock.mockImplementation(()=> 'mocked_hashed_password');
        signing.mock.mockImplementation(()=> "token_jwt_sign")

        collectionManager.getCollectionCache=mock.fn(()=>({
            users: mockcollObj
        }))

    }) // end before each
    afterEach(()=>{

        //reset all methods 
        schemaManager.validateDocument=orignalDocumentValidate;
       collectionManager.getCollectionCache=orignalGetCollectionCache;
        securityRulesEngine.evalRoles=orignalEvalRole;
        hashing.mock.resetCalls();
        signing.mock.resetCalls();
        
        mock.reset();

    })// end after each 

    describe("init()",()=>{
        test("should throw apperror if collection is not in cach with status code 500" , async ()=>{

           // userService.collectionName=null;
            collectionManager.getCollectionCache=mock.fn(()=>{});
           

            await assert.rejects(
                async()=> await userService.init(),
                (err)=>{
                    // console.log("+++++++",err);
                    assert.ok(err instanceof AppError);
                    assert.strictEqual(err.statusCode,500)
                    assert.strictEqual(err.message,"System Error: Users collection not available in cache")
                    return true;
                }
            )

        })// end test 
        test("should sucessfuly initailize user collection",async ()=>{
            await userService.init();
            assert.strictEqual(userService.userCollection,mockcollObj)

        })//end test 
        
    })// end describe 1

    describe("registerUser():--",()=>{

        const validUserData = {
            username: 'testuser',
            accountInfo: {
                email: 'test@example.com',
                password: 'SecurePass123',
                roleName: 'MEMBER'
            }
        };

        test("should sucessfully register new user and gen token",async ()=>{

            // semulate null email 
           mockcollObj.findOne.mock.mockImplementation(()=> Promise.resolve(null))
           mockcollObj.insertOne.mock.mockImplementation(() => Promise.resolve({ insertedId: 'new_user_id_123' }));
           const result=await userService.registerUser(validUserData);

            assert.strictEqual(result.success,true);
            assert.strictEqual(result.data.id, 'new_user_id_123');
            assert.strictEqual(result.data.email,'test@example.com');
            assert.strictEqual(result.data.role,'MEMBER');

            // checking calling methods
            assert.strictEqual(schemaManager.validateDocument.mock.callCount(),1);
            assert.strictEqual(signing.mock.callCount(),1);
            assert.strictEqual(mockcollObj.findOne.mock.callCount(),1);
            assert.strictEqual(mockcollObj.insertOne.mock.callCount(),1);



        })// end test 

         test('should throw AppError if email already exists', async () => {
           // existing user should throw app error with 400 code 
        

            mockcollObj.findOne.mock.mockImplementation(() => Promise.resolve({ _id: 'existing_id' }));

            await assert.rejects(
                async () => await userService.registerUser(validUserData),
                (err) => {
                    assert.ok(err instanceof AppError);
                    assert.strictEqual(err.statusCode, 400);
                    assert.strictEqual(err.message, "Validation Error: User with this email already exists");
                    return true;
                }
            );
        });

        
    })// end describe 


     describe('loginUser()', () => {
        const mockUser = {
            _id: 'user_id_123',
            username: 'testuser',
            accountInfo: {
                email: 'test@example.com',
                roleName: 'MEMBER',
                salt: 'mocked_salt',
                passwordHash: 'mocked_hashed_password' // same mock hash hashPassworNative
            }
        };

        test('should successfully login and return token', async () => {
            mockcollObj.findOne.mock.mockImplementation(() => Promise.resolve(mockUser));

            const result = await userService.loginUser('test@example.com', 'SecurePass123');

            assert.strictEqual(result.success, true);
            assert.strictEqual(result.token, 'token_jwt_sign');
            assert.strictEqual(result.data.id, 'user_id_123');
            assert.strictEqual(result.data.email, 'test@example.com');
        });

        test('should throw AppError if user is not found', async () => {
            mockcollObj.findOne.mock.mockImplementation(() => Promise.resolve(null));

            await assert.rejects(
                async () => await userService.loginUser('wrong@example.com', 'SecurePass123'),
                (err) => {
                    assert.ok(err instanceof AppError);
                    assert.strictEqual(err.statusCode, 401);
                    assert.strictEqual(err.message, "Authentication Error: Invalid Email or Password");
                    return true;
                }
            );
        });

        test('should throw AppError if password is incorrect', async () => {
            mockcollObj.findOne.mock.mockImplementation(() => Promise.resolve(mockUser));
            // not valid hash 
           hashing.mock.mockImplementation( () => Promise.resolve('a'.repeat(128)));

            await assert.rejects(
                async () => await userService.loginUser('test@example.com', 'WrongPassword'),
                (err) => {
                    assert.ok(err instanceof AppError);
                    assert.strictEqual(err.statusCode, 401);
                    assert.strictEqual(err.message, "Authentication Failed: Invalid Email or Password");
                    return true;
                }
            );
        });
    });




    
})