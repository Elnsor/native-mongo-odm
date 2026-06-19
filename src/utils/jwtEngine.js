import crypto from "crypto"
import { AppError } from "../framework/appError.js";


// Helper Function user for encode Json Object to base64  
/**
 * 
 * @param {JOSN} obj 
 * @returns Base64 encoded and remove or replace any (=+/--->-_)
 */

const toBase64Url= (obj)=>{
const jsStr= JSON.stringify(obj)
return Buffer.from(jsStr)
             .toString(`base64`)
             .replace(/=/g,"")
             .replace(/\+/g,"-")
             .replace(/\//g,"_");


};

/**
 * 
 * @param {Sting} base64Url 
 * @param {String} sceret 
 */
const fromBase64Url = (base64Url)=>{


    let base64 = base64Url.replace(/-/g,"+").replace(/_/g,"/");
    while(base64.length % 4){
        base64 += "=" ;
    }

    return JSON.parse(Buffer.from(base64,'base64').toString("utf-8"))

}

/**
 * Signs a payload using HMAC-SHA256
 * @param {JSON} payload -- User Identity claims {e.g., {id: userId}} 
 * @param {String} secret -- your private sceret or key 
 * @param {number} timeInHours -- the duration of this token in Hours 
 * @returns {string}  The final Json Web Token string 
 */

export const signTokenFromScratch = (payload,secret,timeInHours=24) => {

const headr={
     alg: "HS256",
     typ: "jwt"
};

const iat= Math.floor(Date.now() /1000);
const exp=(iat + (timeInHours * 60 *60 ));

const inputPayload={
    ...payload,
    iat,
    exp,
}

const encodedHeader=toBase64Url(headr);
const encodedPayload=toBase64Url(inputPayload);

const signatureInput= `${encodedHeader}.${encodedPayload}`;

const signatureOutput=crypto.createHmac("sha256",secret)
                             .update(signatureInput)
                             .digest('base64')
                             .replace(/=/g,"")
                             .replace(/\+/g,"-")
                             .replace(/\//g,"_");

    return `${signatureInput}.${signatureOutput}`

}


/**
 * 
 * @param {Sting} token 
 * @param {String} secret 
 */
export const verifyTokenFromScratch= (token,secret) =>{

     const decodeToken=token.split(".");

     if(decodeToken.length != 3){
        throw new Error("token not valid");
     }

     const [encodedHeader , encodedPayload, incomingSignature]= decodeToken;


     const encodebody=`${encodedHeader}.${encodedPayload}`;

     const serverSignature= crypto.createHmac('sha256',secret)
                                   .update(encodebody)
                                   .digest('base64')
                                   .replace(/=/g,'')
                                   .replace(/\+/g,'-')
                                   .replace(/\//g,'_');
      
        const incomingBuffer=Buffer.from(incomingSignature);
        const servergBuffer=Buffer.from(serverSignature);

        if(incomingBuffer.length !== servergBuffer.length ){
            throw new Error("Crypto Signature: mismatch Token,(layout size ) token has been Altered.");

        }

        if(!crypto.timingSafeEqual(incomingBuffer,servergBuffer)){
            throw new Error("Crypto Signature: mismatch Token,token has been Altered.");
          }

          const payload=fromBase64Url(encodedPayload);
          
          const currentTimeInSeconde=Math.floor(Date.now() / 1000);

          if(payload.exp && currentTimeInSeconde > payload.exp){
            throw new Error(`Token has expired`);
          }

          return payload;
            


}

