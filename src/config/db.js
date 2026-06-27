import { MongoClient, ServerApiVersion } from "mongodb";
import dotenv from "dotenv"

dotenv.config();

/**
 * new added configuration 
 * Configuration:
 * change: see all environment variable related to Connection to Mongodb 
 * - its Prefer to use a full MONGODB_URI if provided (useful for production / atlas).
 * - Otherwise build a full URI from protocol://username/password/addrs.
 */

const {
  MONGODB_URI,
  MONGODB_PROTOC,
  MONGODB_USERNAME,
  MONGODB_PASSWORD,
  MONGODB_ADDRS,
  MONGODB_DBNAME = "monolith-odm-db",
} = process.env;

function buildUri() {
  if (MONGODB_URI) return MONGODB_URI;

  if (!MONGODB_ADDRS) {
    throw new Error(
      "MONGODB_ADDRS is required (or provide MONGODB_URI). Example: localhost:27017"
    );
  }

  if (MONGODB_USERNAME && !MONGODB_PASSWORD) {
    throw new Error("MONGODB_PASSWORD is required when MONGODB_USERNAME is set.");
  }

  if (MONGODB_USERNAME && MONGODB_PASSWORD) {
    const pw = encodeURIComponent(MONGODB_PASSWORD);
    const un = encodeURIComponent(MONGODB_USERNAME);
    return `${MONGODB_PROTOC}://${un}:${pw}@${MONGODB_ADDRS}`;
  }

  // No auth just a protocol and address
  return `${MONGODB_PROTOC}://${MONGODB_ADDRS}`;
}

const uri = buildUri();

// create client 
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});


let db=null;
let isConnected=false;
let connectionPromise=null;

/* change here for use connection lifecycle events for better observability */

client.on("connectionPoolReady", () => {
  isConnected = true;
  console.log("MongoDB connection pool ready");
});

client.on("close", () => {
  isConnected = false;
  db = null;
  console.log("MongoDB client closed");
});

/** for error  */
client.on("error", (err) => {

  console.error("MongoDB client error:", err);
});

/** change instead of stop all app just throw connection error after allert  */
export async function connectDb(){

    if (db) return db;

    if(connectionPromise) return connectionPromise;
 
    connectionPromise = ( async () => {
 
    try{
        await client.connect();
        db=client.db(MONGODB_DBNAME);

        console.log("connected safely to MongeDb");

        return db;

    }catch(error){

        console.error(`database initialization Faild...${error.message}`);
        connectionPromise=null;
        throw error;
    }
    } )();
    return connectionPromise;
}

export function getDb(){
    if(isConnected && db){
        return db;
    }
    throw new Error("Database not connected yet (initialize it : Call connectDb() first)!!")
}

/** change by add try catch with finaly */

export async function closeDb(){
    try{
    await client.close();
    }catch(err){
        console.error("Error while closing MongoDB client:", err);

    }finally{
    isConnected=false;
    db=null;
    connectionPromise=null;
  console.log("MongoDB connection closed");
    }
}

/** new addition  manage Ctrl+C or sigtrirm instead of managed it in server bootstrap app */

if (typeof process !== "undefined" && process.on) {
  const graceful = async () => {
    try {
      await closeDb();
    } catch (err) {
      console.error("Error during graceful shutdown:", err);
    } finally {
     
      process.exit(0);
    }
  };

  process.on("SIGINT", graceful);
  process.on("SIGTERM", graceful);
}


