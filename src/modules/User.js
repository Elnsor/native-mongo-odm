import { connectDb, getDb } from "../config/db.js";
import { SchemaBuilder } from "../../SchemaBuilder.js";


const COLLECTION_NAME="users"

const userSchema = new SchemaBuilder()
    .string("first_name")
    .number("age")
    .string("email")
    .index({ email: 1 }, { unique: true });


export async function initUserModule() {

    const db = getDb();

    try {

        await db.collection(COLLECTION_NAME).drop();

        console.log(`Drop Collection ${COLLECTION_NAME}`);


        const compileUserValidator = userSchema.compileValidator();

       const userCollection = await db.createCollection(COLLECTION_NAME, compileUserValidator);

        

        for (const userIndex of userSchema.getIndex()) {
            

            const { key, option } = userIndex;
            await userCollection.createIndex(key, option);
        }

        console.log(`collection name ${COLLECTION_NAME} is created with schema Validation Rule and Indexed`);
        return userCollection;

    } catch (error) {
        console.error("Something goes wrong when init user modules", error);


    }
}

