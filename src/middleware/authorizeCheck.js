import { AppError } from "../framework/appError.js";
import { collectionRole } from "../framework/permissions.js";

/**
 * 
 * @param {Sting} role action  [read][write ]
 * @returns 
 */

export const authorizeCheck=(action) => {
    return (req,res,next) =>{

        const collName=req.params.collectionName ;
        const userRole=req.user.role;

        const roles=collectionRole[collName];
        if(!roles){
            return next(new AppError(`Access Denied: Resource '${collName}' is restricted`, 403));
        }

        //read:[] ,write []
        const allowedRole=roles[action];

        if(!allowedRole || !allowedRole.includes(userRole)){
            return next(new AppError(`Access Denied: Your role ${userRole} cannot execute ${action} on ${collName}`,403))
            }
            next();
        }
    }




