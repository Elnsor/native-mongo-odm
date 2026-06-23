//import crypto from 'crypto'
import {describe, test,beforeEach,afterEach,mock} from 'node:test'
import assert from 'node:assert/strict';
import { signTokenFromScratch as originalSignToken, signTokenFromScratch } from '../utils/jwtEngine.js';
import {  hashPassworNative as originalHash } from '../utils/helperhash.js';
import { collectionManager } from '../framework/CollectionManager.js';
import { ObjectId } from 'mongodb/lib/bson.js';
import { schemaManager } from '../validation/schemaManager.js';



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
});

 const {register} = await import('../controllers/authRegister.contoller.js');
describe("Login Test",async ()=>{
    let res,req,next;
    let collobj;
    let newUser;

    const fackPass="123456789"
   
    const fackEmail="example@example.com"
    beforeEach(() => {

        newUser={
           username:"dumyName",
            password:fackPass,
            email:fackEmail,
            role:'user',
        }
        
        collobj={
           findOne:mock.fn(async function(){ return null}),
           insertOne:mock.fn(async()=> ({insertedId: new ObjectId().toString()}))
           };

           
           mock.method(collectionManager,'getCollectionCache',()=>{
            return {users:collobj}
           });
           mock.method(schemaManager,"validateDocument",async()=>req.body);

           req={
            body:{...newUser}
            
           };
           res={
            status:mock.fn(function(){return this}),
            json:mock.fn(function(){return this}),
           }

           next=mock.fn();

    });//end befor
    afterEach(()=>{
        collobj.findOne.mock.resetCalls();
        collobj.insertOne.mock.resetCalls();
        genHash.mock.resetCalls();
  
    });//end after

    describe("Unit Test:Register New user ",()=>{
            describe("Gevin:Valid user Document",()=>{
                test("should operation done without error ", async ()=>{
    
                await register(req,res,next);
    
                
                assert.equal(next.mock.calls.length,0);

                assert.equal(collectionManager.getCollectionCache.mock.calls.length,1)
                assert.equal(collectionManager.getCollectionCache.mock.calls[0].result['users'],collobj);
    
    
                assert.equal(res.status.mock.calls.length,1);
                assert.equal(genHash.mock.calls.length,1)
                assert.equal(signToken.mock.calls.length,1)
                assert.strictEqual(res.status.mock.calls[0].arguments[0],201)
                assert.strictEqual(res.json.mock.calls[0].arguments[0].data.username,"dumyName")
                



            });
    
    
    
            });//child desc
            
    });//parent 
    describe( "EDGE CASES:  receive with  no  password",()=>{
            describe("Gevin:Receive Email wihtout Password",()=>{
                test("shoud retrun statusCode 400 with message .. provide both...", async ()=>{
    
newUser={
           username:"dumyName",
            
            email:fackEmail,
            role:'user',
        }

        req={
            body:newUser,
        }
                await register(req,res,next);
    
                assert.equal(next.mock.calls.length,1);
                assert.equal(next.mock.calls[0].arguments[0].statusCode,400);
                assert.match(next.mock.calls[0].arguments[0].message,/ password is required/i);
    
    
    
    
            });//test case 1
            });
            describe("Gevin:user found in db  ",()=>{
                test("should: return (401) and message Invalid Email or Passowr", async ()=>{
    
                collobj.findOne.mock.mockImplementationOnce(async () => newUser)
                await register(req,res,next);
    
                assert.equal(next.mock.calls.length,1);
                assert.equal(next.mock.calls[0].arguments[0].statusCode,400);
                assert.match(next.mock.calls[0].arguments[0].message,/user with this email already exist/i);
            });//test 
            });//child desc

             describe("Gevin Db Failure (no collection Object) ",()=>{
                test("should: return (500) and message Loginsystem Error", async ()=>{
    
               const temp=collobj;
               collobj=null;
                await register(req,res,next);
    
                assert.equal(next.mock.calls.length,1);
                assert.equal(next.mock.calls[0].arguments[0].statusCode,500);
                assert.match(next.mock.calls[0].arguments[0].message,/Loginsystem Error/i);
                collobj=temp;
            });//test 
            });//child desc
        });//parent desc
});//end outr