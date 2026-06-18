import { AppError } from "../framework/appError.js";
import { collectionManager } from "../framework/CollectionManager.js";
import { verifyTokenFromScratch } from "../utils/jwtEngine.js";
import { ObjectId } from "mongodb/lib/bson.js";

/**
 * 
 * @param {Request} req 
 * @param {Response} res 
 * @param {*} next 
 */

export const tokenauth= async (req,res,next) =>{

try{ 
     let token;
    if(req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ){
    token=req.headers.authorization.split(' ')[1];
  }
  if(!token){
    throw new AppError(`Authentication Faild: You dont login (not have token --> debug)..please login first`,401);
  }
 
  let payload;
  try{
    payload=verifyTokenFromScratch(token,process.env.SECRET_KEY);

  }catch(CryptoErr){
    throw new AppError(`Authentication Faild: (have token but not verify )${CryptoErr.message}`,401);

  };

  const userCollection=await collectionManager.getCollection(req.params.collectionName);

  if(!userCollection){
    throw new AppError("Authentication System Error: users Collection is inactive state",500);
  }

  const currentUser=await userCollection.findOne({_id: new ObjectId(payload.id)},{ projection :{ password:0 , salt:0 }});

  if(!currentUser){
    throw new AppError("Authentication Faild: the User belong to this active Token no longer exist!! ",401);
  }

  req.user=currentUser;
  next();

}catch(error){
    next(error);
}


}