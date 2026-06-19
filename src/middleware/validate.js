import { schemManager } from "../validation/schemaManager.js";
import { catchAsync } from "../utils/catchAsync.js";

/**
 * fot inspect the body and validate it 
 */
const validationCollection= catchAsync(async (req,res,next)=>{

    const  collecionName=req.params.collectionName;

    const isUpdate = req.method === 'PUT' || req.method === `PATCH`;

    req.body = await schemManager
                     .validateDocument(
                        collecionName,
                        req.body,
                        {"_id":true, "createdAt":true, "updatedAt":true,"salt":true},
                        isUpdate);
next();
});


export default validationCollection