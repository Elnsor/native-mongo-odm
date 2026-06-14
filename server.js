import express from "express"
import { MongoClient , ServerApiVersion } from "mongodb";
import dotenv from "dotenv"
import { SchemaBuilder } from "./SchemaBuilder.js";

dotenv.config();
const MONGODB_DBNAME = 'monolith-odm-db';
const COLLECTION_NAME= 'users'

const app=express();
app.use(express.json());

let db;
let userCollection="";

const uri=`mongodb://${process.env.MONGODB_USERNAME}:${encodeURIComponent(process.env.MONGODB_PASSWORD)}@${process.env.MONGODB_ADDRS}`;


// create client 
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});


async function initDatabase() {

    const userSchema=new SchemaBuilder()
    .string("first_name")
    .number("age")
    .string("email")
    .index({email: 1},{unique: true});

    const compileUserValidator=userSchema.compileValidator();

try{

    await client.connect()
    db=client.db(MONGODB_DBNAME);
    console.log("connected safely to MongeDb");


    await db.collection(COLLECTION_NAME).drop();

    console.log(`Drop Collection ${COLLECTION_NAME}`);

    const collection= await db.listCollections({name:COLLECTION_NAME}).toArray();

    if(collection.length === 0){
       userCollection= await db.createCollection(COLLECTION_NAME,compileUserValidator);

    console.log(`collection name ${COLLECTION_NAME} is created with schema Validation Rule`);
    for(const userIndex of userSchema.getIndex()){
        console.log(userIndex)
        
        const {key,option}=userIndex;
        await userCollection.createIndex(key,option);
    }
    
    }else{
        userCollection=db.collection(COLLECTION_NAME);
    }

}catch(error){

    console.error("Db Initialization Faild",error.message);
    process.exit(1);

}    
    
};


app.post("/users",async (req,res) => {

  try {
        if(!userCollection){
        res.status(500).json({error:`database Context no initialize yet !!.`});
    }

    const newUser=req.body;
    


 
      const result= await userCollection.insertOne(newUser);
     
      res.status(201).json({message:`New User Write Succesfully`,id:result.insertedId});
      

    }catch(error){
        res.status(400).json({error:`Writing operation rejected by database validation blueprint rule.`,
            details: error.stack
        });

    } 

});


const PORT=3000;
initDatabase().then( () => app.listen(PORT,()=>{
    console.log(`Phase one in Monolith server operation http://localhost:${PORT}`);
}))


