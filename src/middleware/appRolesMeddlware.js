import { schemaManager } from "../validation/schemaManager.js";
import { catchAsync } from "../utils/catchAsync.js";
import { ObjectId } from "mongodb/lib/bson.js";
import { AppError } from "../framework/appError.js";
import { securityRulesEngine } from "../framework/engines/SecurityRulesEngine.js";


/**
 * fot inspect the body and validate it 
 */
const validationCollection= catchAsync(async (req,res,next)=>{

    const  collecionName=req.params.collectionName;
    const isUpdate = req.method === 'PUT' || req.method === `PATCH`;

    const userContext={role:req.user.accountInfo.roleName};
    const sanitizedDoc=req.body;


    if(isUpdate){

     
        const currenDoc=req.currentDoc
        

        req.body=await securityRulesEngine.evalRoles(collecionName,sanitizedDoc,currenDoc,userContext,isUpdate);
    }else{
        req.body=await securityRulesEngine.evalRoles(collecionName,sanitizedDoc,null,userContext,isUpdate);
    }

   
next();
});


export default validationCollection