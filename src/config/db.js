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
let connectionPromise=null;

client.on("connectionPoolReady",()=>{
    isConnected=true;
})


export async function connectDb(){

    if (db) return db;

    if(connectionPromise) return connectionPromise;
 
    connectionPromise = ( async () => {
 
    try{
        await client.connect();
        db=client.db(dbName);

        console.log("connected safely to MongeDb");

        return db;

    }catch(error){

        console.error(`database initialization Faild...${error.message}`);
        connectionPromise=null;
        process.exit(1);
    }
    } )();
    return connectionPromise;
}

export function getDb(){
    if(isConnected && db){
        return db;
    }
    throw new Error("Database not connected yet (initialize it)!!")
}

export async function closeDb(){
    await client.close();
    this.isConnected=null;
    this.db=null;
    this.connectionPromise=null;
  
  console.log("connection to DB closed");
}


