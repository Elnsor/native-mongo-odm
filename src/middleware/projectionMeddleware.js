
import { catchAsync } from "../utils/catchAsync.js";
import { Projection} from "../framework/engines/projectionEngine.js";

export const selectProjection=catchAsync(async (req,res,next) =>{

    
    req["projection"]=Projection.getProjection(req.params.collectionName);

    next();


})




