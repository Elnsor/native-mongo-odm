
import express from "express"
import { getDb } from "../config/db.js";



const router=express.Router();
const COLLECTION_NAME="users"

router.post("/",async (req,res) => {

  

  try{

    const db=getDb();
    const userCollection=db.collection(COLLECTION_NAME);
  
    const newUser=req.body;

    
      const result= await userCollection.insertOne(newUser);
     
      res.status(201).json({message:`New User Write Succesfully`,id:result.insertedId});
      

    }catch(error){
        res.status(400).json({error:`Writing operation rejected by database validation blueprint rule.`,
            details: error.stack
        });

    } 

});

export {router as userRouter};