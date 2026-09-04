import { schemaManager } from "../validation/schemaManager.js";
import { catchAsync } from "../utils/catchAsync.js";
import { ObjectId } from "mongodb";
import { getDb } from "../config/db.js";
import { AppError } from "../framework/appError.js";


/**
 * fot inspect the body and validate it 
 */
const validationCollection= catchAsync(async (req,res,next)=>{

    const  collectionName=req.params.collectionName;
     



    const isUpdate = req.method === 'PUT' || req.method === `PATCH`;


    if(isUpdate){

        let id = req.params.id || req.body._id
        if(!id){
            throw new AppError("Bad Request: Missing document identifier required for updates.", 400);
            
        }
   
       const db=getDb();
        
    if (!ObjectId.isValid(id)) {
    throw new AppError(`Bad Request: Invalid document ID format: ${id}`, 400);
}
id = new ObjectId(id);
      
       const collobj=db.collection( collectionName);

       const currentDoc=await collobj.findOne({_id:id});
       
       if (!currentDoc) {
            throw new AppError(`Data Integrity Error: Document with ID ${id} not found in collection ${ collectionName}.`, 404);
        }

        req.currentDoc=currentDoc;
    }

    req.body = await schemaManager
                     .validateDocument(
                        collectionName,
                        req.body,
                        {"_id":true, "createdAt":true, "updatedAt":true,"salt":true},
                        isUpdate);
                       
next();
});


export default validationCollection