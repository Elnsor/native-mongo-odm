import { schemManager } from "../validation/schemaManager.js";
import { catchAsync } from "../utils/catchAsync.js";

/**
 * fot inspect the body and validate it 
 */
const validationCollection= catchAsync(async (req,res,next)=>{

    const  collecionName=req.params.collectionName;

    const isUpdate = req.method === 'PUT' || req.method === `PATCH`;

    req.body = await schemManager.validateDocument(collecionName,req.body,
                                        { skipRequired : ["_id", "createdAt", "updatedAt","password","salt"],update:isUpdate});
next();
});


export default validationCollection