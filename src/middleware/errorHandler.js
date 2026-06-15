import { MongoError } from "mongodb";
import { BSONError } from "mongodb/lib/bson.js";


let obj=new BSONError();
obj.cause
/**
 * 
 * @param {BSONError}  
 * @param {*} req 
 * @param {*} res 
 * @param {*} next 
 */
export const globalErorrHnadler = (err,req,res,next) => {
console.log( err.cause);
    err.statusCode= err.statusCode || 500
    err.status= err.status || `error`


    res.status(err.statusCode).json(
        {
            success : `fail`,
            status: err.status,
            message: err.message || `An unexpected framework error occurred.`,
            ...(process.env.APP_ENV  === `production` && {stack:err.stack})

                }
    )
}