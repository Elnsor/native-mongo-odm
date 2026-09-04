import crypto from "crypto"
import { AppError } from "../framework/appError.js";
import { collectionManager } from "../framework/CollectionManager.js";
import { signTokenFromScratch } from "../utils/jwtEngine.js";
import { hashPassworNative } from "../utils/helperhash.js";


export const login = async (req, res, next) => {

    //user send me password and email check it 
    try {
        // if (!req.body || !(req.body.accountInfo.email && req.body.accountInfo.password)) {
        //     throw new AppError("Validation Error:Please Provide both Email and Password!!", 400);
        // }
        // const { email, password } = req.body.accountInfo

        if (!req.body || !(req.body.email && req.body.password)) {
            throw new AppError("Validation Error:Please Provide both Email and Password!!", 400);
        }
        const { email, password } = req.body
        


        // get user for collection users check it 
        const coll = collectionManager.getCollectionCache()["users"];
        

        const newUser = await coll.findOne({ "accountInfo.email": email });
        
        if (!newUser) {
            throw new AppError("Authentication Error:Invalid Email or Passowr", 401);
        };
        // fetch hash password and salt 
        //creat new hasshing by password and salt
        const newHashPassword = await hashPassworNative(password, newUser.accountInfo.salt);
        // buffring both hasshing 
        const newHashBuffer = Buffer.from(newHashPassword, "hex")
        const oldHashBuffer = Buffer.from(newUser.accountInfo.passwordHash, "hex");
        // verify is success or no success
        if (newHashBuffer.length !== oldHashBuffer.length || !crypto.timingSafeEqual(newHashBuffer, oldHashBuffer)) {
            throw new AppError("Authentication Faild: Invalid Email or Password", 401);
        }
        // generate new token 
        
        const token = signTokenFromScratch({ id: newUser._id, role: newUser.accountInfo.roleName }, process.env.SECRET_KEY, 24);
        //send this token to user
        res.status(200).json({
            success: true,
            message: "Login successfuly🤠",
            token,
            data: {
                id: newUser._id,
                username: newUser.username,
                email: newUser.accountInfo.email,
                role: newUser.accountInfo.roleName

            }
        })
    } catch (err) {
        next(err);
    }
}





