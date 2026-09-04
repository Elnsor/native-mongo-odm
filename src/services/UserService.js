import crypto from "crypto";
import { AppError } from "../framework/appError.js";
import { collectionManager } from "../framework/CollectionManager.js";
import { schemaManager } from "../validation/schemaManager.js";
import { securityRulesEngine } from "../framework/engines/SecurityRulesEngine.js";
import { hashPassworNative } from "../utils/helperhash.js";
import { signTokenFromScratch } from "../utils/jwtEngine.js";
import { tmpdir } from "os";

/**
 * UserService - 
 * Business Logic layer 
 * seperate controller from data layer
 */
class UserService {
    constructor(collectionName) {
        this.userCollection = null;
        this.collectionName=collectionName;
    }

    /**
     * this to initialization for this service 
     * its used collection name 'users'  
     */
    async init() {
        this.userCollection = collectionManager.getCollectionCache()?.[this.collectionName];
        if (!this.userCollection) {
            throw new AppError(
                "System Error: Users collection not available in cache",
                500
            );
        }
    }

    /**
     * register new users 
     * @param {Object} userData - request user data 
     * @returns {Object} - result is return token (JWT Tokent)
     */
    async registerUser(userData) {
        //chech and this service is init
        if (!this.userCollection) {
            await this.init();
        }

        // validate user data 
        const validatedBody = await schemaManager.validateDocument(
            'users',
            userData,
            { 
                "_id": true, 
                "createdAt": true, 
                "updatedAt": true, 
                "salt": true,
                "version": true 
            },
            false
        );

        // Business Rule: verify passward 
        const plainTextPassword = userData.accountInfo?.password;
        if (!plainTextPassword) {
            throw new AppError(
                "Validation Error: A valid password is required to complete registration",
                400
            );
        }

        // 4. Business Rule: check its new user that not exist in users data collection 
        await this.checkEmailExists(validatedBody.accountInfo.email);

        // Business Rule:  generate salt used for hashed passward
        const salt = crypto.randomBytes(16).toString("hex");
        const hashedPassword = await hashPassworNative(plainTextPassword, salt);

        //  build verified users Document 
        const newUserDoc = {
            ...validatedBody,
            accountInfo: {
                ...validatedBody.accountInfo,
                passwordHash: hashedPassword,
                salt: salt
            }
        };

        // check and apply appRoles like (managedBySystem, timestamps, etc.)
        const securedDoc = await securityRulesEngine.evalRoles(
            "users",
            newUserDoc,
            null,
            { role: ["ADMIN"] },  // this can be change * * i dont configure what user card should look like 
            false
        );

        // insert user document to users collection in db 
        const result = await this.userCollection.insertOne(securedDoc);

        // generate token 
        const token = this.generateToken({
            _id: result.insertedId,
            accountInfo: securedDoc.accountInfo
        });

        // this the return valid user date 
        return {
            success: true,
            message: "User registered successfully via framework pipeline ",
            token,
            data: {
                id: result.insertedId,
                username: securedDoc.username,
                email: securedDoc.accountInfo.email,
                role: securedDoc.accountInfo.roleName 
            }
        };
    }

    /**
     * for Login user
     * @param {string} email - email address
     * @param {string} password - passward 
     * @returns {Object} - its jwt token
     */
    async loginUser(email, password) {
        
        if (!this.userCollection) {
            await this.init();
        }

        
        const user = await this.userCollection.findOne({
            "accountInfo.email": email
        });

        if (!user) {
            throw new AppError(
                "Authentication Error: Invalid Email or Password",
                401
            );
        }

        
        await this.verifyPassword(password, user);

        
        const token = this.generateToken(user);

        
        return {
            success: true,
            message: "Login successfully ",
            token,
            data: {
                id: user._id,
                username: user.username,
                email: user.accountInfo.email,
                role: user.accountInfo.roleName 
            }
        };
    }

    /**
     * check email exist
     * @private
     */
    async checkEmailExists(email) {
        const userExist = await this.userCollection.findOne({
            "accountInfo.email": email
        });

        if (userExist) {
            throw new AppError(
                "Validation Error: User with this email already exists",
                400
            );
        }
    }

    /**
     * used for verified incomming password 
     * @private
     */
    async verifyPassword(password, user) {
        const newHashPassword = await hashPassworNative(
            password,
            user.accountInfo.salt
        );

        const newHashBuffer = Buffer.from(newHashPassword, "hex");
        const oldHashBuffer = Buffer.from(user.accountInfo.passwordHash, "hex");
        

  
  
        if (newHashBuffer.length !== oldHashBuffer.length || !crypto.timingSafeEqual(newHashBuffer, oldHashBuffer)) {
         
            throw new AppError(
                "Authentication Failed: Invalid Email or Password",
                401
            );
        }
        
    }

    /**
     * generatet JWT token 
     * @private
     */
    generateToken(user) {
        return signTokenFromScratch(
            {
                id: user._id,
                role: user.accountInfo.roleName  
            },
            process.env.SECRET_KEY,
            24
        );
    }
}

// Singleton instance
export const userService = new UserService("users");