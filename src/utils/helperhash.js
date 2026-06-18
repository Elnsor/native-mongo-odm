
import crypto from "crypto"



export const hashPassworNative= (password,salt) =>{
    return new Promise((resolve,reject)=>{
        crypto.pbkdf2(password,salt,100000,64,'sha512',(err,derivedKey)=>{
            if(err) reject(err);
            resolve(derivedKey.toString("hex"));

        });
    });
};