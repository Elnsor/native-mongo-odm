
import crypto from "crypto"
import { hash, verify } from 'argon2';




export const hashPassworNative= (password,salt) =>{
    return new Promise((resolve,reject)=>{
        crypto.pbkdf2(password,salt,100000,64,'sha512',(err,derivedKey)=>{
            if(err) reject(err);
            resolve(derivedKey.toString("hex"));

        });
    });
};

export const argonHashPassword = async (password) => {
    return await hash(password, {
        type: argon2.argon2id,
        memoryCost: 2 ** 16,  // 64 MB
        timeCost: 3,
        parallelism: 1
    });
};

export const argonVerifyPassword = async (hash, password) => {
    return await verify(hash, password);
};