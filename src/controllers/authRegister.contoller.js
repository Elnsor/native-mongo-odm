import { hashPassworNative } from "../utils/helperhash.js";
import { schemManager } from "../validation/schemaManager.js";
import { AppError } from "../framework/appError.js";
import { signTokenFromScratch } from "../utils/jwtEngine.js";
import { collectionManager } from "../framework/CollectionManager.js";
import crypto from "crypto"


export const register = async (req, res, next) => {

    try {

        const validatedBody = await schemManager
            .validateDocument(
                'users',
                req.body,
                { "_id": true, "createdAt": true, "updatedAt": true, "salt": true },
                false);


        // password validate 
        const plainTextPassword = req.body.password;
        if (!plainTextPassword) {
            throw new AppError("Validation Error: A valid password is required to complete registration", 400);
        }
        // get collection 
        const coll = collectionManager.getCollectionCache()['users'];
        if (!coll) {
            throw new AppError("Loginsystem Error: No collection server issue try again later", 500);
        }

        const userExist = await coll.findOne({ email: validatedBody.email });
        // check if user exist 
        if (userExist) {
            throw new AppError("Validation Error: user with this email already exist", 400);
        }

        // generat salt 
        const salt = crypto.randomBytes(16).toString("hex");

        // hashing password 
        const hashedPassword = await hashPassworNative(req.body.password, salt);
        // build doc user
        const newUserDoc = {
            ...validatedBody,
            password: hashedPassword,
            salt: salt,
            role: req.body.role || 'user'  // in porduction this always be 'user'

        }
        //inser new user in uses
        const result = await coll.insertOne(newUserDoc);
        // generat token
        const token = signTokenFromScratch({ id: result.insertedId, role: newUserDoc.role }, process.env.SECRET_KEY, 24);
        //response user with token and details 
        res.status(201).json({
            success: true,
            message: `User Register successfully via frameworke pipline 🤠`,
            token,
            data: {
                id: result.insertedId,
                username: newUserDoc.username,
                email: newUserDoc.email,
                role: newUserDoc.role
            }
        })

    } catch (err) {
        next(err);

    }

}