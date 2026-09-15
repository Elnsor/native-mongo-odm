import { AppError } from "../framework/appError.js";
import { collectionManager } from "../framework/CollectionManager.js";
import { verifyTokenFromScratch } from "../utils/jwtEngine.js";
import { ObjectId } from "mongodb/lib/bson.js";
import { Projection } from "../framework/engines/projectionEngine.js";
import { record, auditLog } from "../Monitor/monitoringSystem.js";
import { DOMAIN, EVENT_TYPES, EVENT_MTYPES } from "../Monitor/constant/eventType.js";

/**
 * 
 * @param {Request} req 
 * @param {Response} res 
 * @param {*} next 
 */

export const tokenauth= async (req,res,next) =>{

    const startTime = performance.now();
    let clientIp = req.ip || req.socket.remoteAddress;

try{ 
     let token;
    if(req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ){
    token=req.headers.authorization.split(' ')[1];
  }
  if(!token){
      record(DOMAIN.AUTH_DOMAIN, EVENT_TYPES.AUTH_TOKEN_VERIFY_FAILED, EVENT_MTYPES.METRIC_C);
      auditLog(DOMAIN.AUTH_DOMAIN, 'auth_no_token', { ip: clientIp }, {}, 'failure', { reason: 'missing_header' });

    throw new AppError(`Authentication Faild: You dont login (not have token --> debug)..please login first`,401);
  }
 
  let payload;
  try{
    record(DOMAIN.AUTH_DOMAIN, EVENT_TYPES.AUTH_TOKEN_VERIFY_START, EVENT_MTYPES.METRIC_C);
    payload=verifyTokenFromScratch(token,process.env.SECRET_KEY);

  }catch(CryptoErr){

    record(DOMAIN.AUTH_DOMAIN, EVENT_TYPES.AUTH_TOKEN_VERIFY_FAILED, EVENT_MTYPES.METRIC_C);
    auditLog(DOMAIN.AUTH_DOMAIN, 'auth_token_invalid', { ip: clientIp }, {}, 'failure', { reason: CryptoErr.message });

    throw new AppError(`Authentication Faild: (have token but not verify )${CryptoErr.message}`,401);

  };

  const userCollection=await collectionManager.getCollection(`users`);

  if(!userCollection){

    
    throw new AppError("Authentication System Error: users Collection is inactive state",500);
  }

  const currentUser=await userCollection.findOne({_id: new ObjectId(payload.id)},{ projection : Projection.getProjection(`users`)});

  if(!currentUser){

     record(DOMAIN.AUTH_DOMAIN, EVENT_TYPES.AUTH_TOKEN_VERIFY_FAILED, EVENT_MTYPES.METRIC_C);
     auditLog(DOMAIN.AUTH_DOMAIN, 'auth_user_not_found', { ip: clientIp, userId: payload.id }, {}, 'failure');
     
    throw new AppError("Authentication Faild: the User belong to this active Token no longer exist!! ",401);
  }

  const durationNs = (performance.now() - startTime) * 1000000;
        record(DOMAIN.AUTH_DOMAIN, EVENT_TYPES.AUTH_TOKEN_VERIFY_END, EVENT_MTYPES.METRIC_H, durationNs);
        auditLog(
            DOMAIN.AUTH_DOMAIN, 'auth_success', 
            { userId: payload.id, ip: clientIp }, 
            { role: currentUser.accountInfo?.roleName }, 
            'success'
        );
// user card


  req.user=currentUser;
  next();

}catch(error){
    next(error);
}


}