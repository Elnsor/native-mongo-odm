import express from "express"
import { BaseController } from "../framework/BaseController.js"
import   validator      from "../middleware/validate.js";
import { tokenauth } from "../middleware/authMeddlware.js";
import { authorizeCheck } from "../middleware/authorizeCheck.js";
import validationCollection from "../middleware/appRolesMeddlware.js"
import { selectProjection } from "../middleware/projectionMeddleware.js";
import { TYPE_IDS } from "../rbac/constant/resourceType.js";


const universalRouter=express.Router({mergeParams:true});
const universalController=new BaseController();
/**
 * @type {import("../middleware/authorizeCheck.js").AuthorizedOptions}
 */
 
 

const authOptions={
    parentTypePid:TYPE_IDS.COLLECTIONS,
    parentInsName: "users",
    childTypePid:TYPE_IDS.DOCUMENTS,
    childInsName:"doc",
    grandChildTypePid:null,
    grandchildInsName:null,
    ownerFildChecker:'_id',


}

universalRouter.get("/",tokenauth       ,authorizeCheck('READ',authOptions),selectProjection,universalController.findAll);
universalRouter.get("/:_id",tokenauth    ,authorizeCheck('READ',authOptions),selectProjection,universalController.findById);
universalRouter.post("/",tokenauth      ,authorizeCheck('WRITE',authOptions),validator,validationCollection,universalController.create);
universalRouter.put("/:_id",tokenauth    ,authorizeCheck('UPDATE',authOptions),validator,validationCollection,universalController.update);
universalRouter.delete("/:_id",tokenauth ,authorizeCheck('DELETE',authOptions),universalController.remove);



export default universalRouter
