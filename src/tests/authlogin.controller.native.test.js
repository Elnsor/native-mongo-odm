
import crypto from 'crypto'
import {describe, test,beforeEach,afterEach,mock} from 'node:test'
import assert from 'node:assert/strict';
import { signTokenFromScratch as originalSignToken, signTokenFromScratch } from '../utils/jwtEngine.js';
import {  hashPassworNative as originalHash } from '../utils/helperhash.js';
import { collectionManager } from '../framework/CollectionManager.js';
import { ObjectId } from 'mongodb/lib/bson.js';



const signToken=mock.fn(originalSignToken);
const genHash=mock.fn(originalHash);

mock.module('../utils/jwtEngine.js',{
    exports:{
        signTokenFromScratch:signToken,
    }
})

mock.module('../utils/helperhash.js',{
    exports:{
        hashPassworNative: genHash,
    }
})

const {login} =await import("../controllers/authLogin.controller.js")

// mock sign token , mocks verify hash password , mock getCollectionCache




describe("Login Test",async ()=>{
    let res,req,next;
    let collobj;
    let newUser;

    const fackPass="123456789"
    const fackHasingPass='a1b2c3d4e5f67890a1b2c3d4e5f67890'
    const fackEmail="example@example.com"
    const validtoken="valid.gen.token"
    beforeEach(() => {

        newUser={
            _id:new ObjectId().toString(),
            password:fackHasingPass,
            email:fackEmail,
            role:'user',
          

        }
        
         collobj={
           findOne:mock.fn(async function(){ return newUser})
           };
           
           mock.method(collectionManager,'getCollectionCache',()=>{
            return {users:collobj}
           });
           genHash.mock.mockImplementation(async()=> fackHasingPass);
           signToken.mock.mockImplementation(()=>validtoken);

           req={
            body:{
                email:fackEmail,
                password:fackPass,
            }
            
           };
           res={
            status:mock.fn(function(){return this}),
            json:mock.fn(function(){return this}),
           }

           next=mock.fn();


    });//end befor
    afterEach(()=>{
      
         signToken.mock.resetCalls();
         genHash.mock.resetCalls();
         collobj.findOne.mock.resetCalls();
         mock.reset();
        

    });//end after

    describe("Unit Test: Valid Login ",()=>{
        describe("Gevin:Valid email and password",()=>{
            test("should validate user email and passwor and generate new token", async ()=>{

            await login(req,res,next);

            assert.equal(collectionManager.getCollectionCache.mock.calls.length,1)
            assert.equal(collectionManager.getCollectionCache.mock.calls[0].result['users'],collobj);


            assert.equal(res.status.mock.calls.length,1);
            assert.equal(res.status.mock.calls[0].arguments[0],200);

            assert.equal(signToken.mock.calls.length,1)
            assert.equal(next.mock.calls.length,0);
            assert.strictEqual(res.json.mock.calls[0].arguments[0].token,validtoken);
        });



        });//child desc

            
   }); //parent desc
   
    describe( "EDGE CASES:  receive user email with no  password",()=>{
        describe("Gevin:Receive Email wihtout Password",()=>{
            test("shoud retrun statusCode 400 with message .. provide both...", async ()=>{

            req={
                body:{
                    email:"example@example.com"
                }
            };
            await login(req,res,next);

            assert.equal(next.mock.calls.length,1);
            assert.equal(next.mock.calls[0].arguments[0].statusCode,400);
            assert.match(next.mock.calls[0].arguments[0].message,/ Provide both Email and Password/i);




        });//test case 1
        });
        describe("Gevin:user not found in db  ",()=>{
            test("should: return (401) and message Invalid Email or Passowr", async ()=>{

            collobj.findOne.mock.mockImplementationOnce(async () => null)
            await login(req,res,next);

            assert.equal(next.mock.calls.length,1);
            assert.equal(next.mock.calls[0].arguments[0].statusCode,401);
            assert.match(next.mock.calls[0].arguments[0].message,/Invalid Email or Passowr/i);
        });//test 
        });//child desc

        describe("Gevin:None Valid Hass Password  ",()=>{
            test("should: return (401) and message Invalid Email or Passowr", async ()=>{

            genHash.mock.mockImplementationOnce(async () => "ffffffffffffffffffffffffffffffff");
            await login(req,res,next);

            assert.equal(next.mock.calls.length,1);
            assert.equal(next.mock.calls[0].arguments[0].statusCode,401);
            assert.match(next.mock.calls[0].arguments[0].message,/#️⃣Invalid Email or Password/i);
        });//test 
        });//child desc

          describe("Gevin:user not found in db  ",()=>{
            test("should: return (401) and message Invalid Email or Passowr", async ()=>{

            collobj.findOne.mock.mockImplementationOnce(async () => {throw new Error("Timeout: Database cluster is offline")});
            await login(req,res,next);

            assert.equal(next.mock.calls.length,1);
            
            assert.match(next.mock.calls[0].arguments[0].message,/Database cluster is offline/i);
        });//test 
        });//child desc
        
    });//parent desc
});// end outer desc