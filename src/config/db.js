import { MongoClient, ServerApiVersion } from "mongodb";
import dotenv from "dotenv"

dotenv.config();

const uri=`mongodb://${process.env.MONGODB_USERNAME}:${encodeURIComponent(process.env.MONGODB_PASSWORD)}@${process.env.MONGODB_ADDRS}`;
const dbName = 'monolith-odm-db';

// create client 
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});


let db=null;
let isConnected=null;

client.on("connectionCreated",()=>{
    isConnected=true;
})

client.on("connectionClosed",()=>{
    isConnected=null;
})

export async function connectDb(){

    if (isConnected && db){
        return db;
    }

    try{
        await client.connect();
        db=client.db(dbName);

        console.log("connected safely to MongeDb");

        return db;

    }catch(error){

        console.error(`database initialization Faild...${error.message}`);
        process.exit(1);
    }
}

export function getDb(){
    if(isConnected){
        return db;
    }
    throw new Error("Database not connected yet (initialize it)!!")
}

export async function closeDb(){
    await client.close();
  
  console.log("connection to DB closed");
}


