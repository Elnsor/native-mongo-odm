import crypto from "crypto";
import { AppError } from "../framework/appError.js";
import { collectionManager } from "../framework/CollectionManager.js";
import { schemaManager } from "../validation/schemaManager.js";
import { securityRulesEngine } from "../framework/engines/SecurityRulesEngine.js";
import { hashPassworNative } from "../utils/helperhash.js";
import { signTokenFromScratch } from "../utils/jwtEngine.js";
import { InvalidateUserCache } from "../middleware/authMeddlware.js";
import { frameworkConfig } from "../config/frameworkConfig.js";
import { ObjectId } from "mongodb/lib/bson.js";
import { Projection } from "../framework/engines/projectionEngine.js";

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

        // Business Rule: check its new user that not exist in users data collection 
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

        // generate token one method 
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


    /**
     * Update user profile
     * @param {string} userId - User ID to update
     * @param {Object} updateData - Fields to update
     * @param {Object} userContext - Current user context for security rules
     * @returns {Object} - Updated user data
     */
    
async updateUser(userId, currentUserDoc,updateData, userContext = { role: [] }) {
    if (!this.userCollection) await this.init();

    // ── Step 1: Resolve currentDoc (ZERO DB hits on self-update) ──
    let ownerUserId=currentUserDoc._id;
    let currentDoc;
   
    const isSelfUpdate = String(ownerUserId) === String(userId);
        

    
    if (isSelfUpdate) {
        currentDoc = currentUserDoc
    } else {
        currentDoc = await this.userCollection.findOne({ _id: userId });
        if (!currentDoc) throw new AppError("User not found", 404);
    }

    //  Soft-Delete Guard (Prevent updating deleted users)
        if (frameworkConfig.schemaDefaults.softDocumentDelete && currentDoc.deletedAt) {
             InvalidateUserCache(String(userId));
            throw new AppError("Cannot update a soft-deleted user", 400);
        }

      

    // ── Schema validation (SAME engine the middleware used) ──
    const validatedUpdate = await schemaManager.validateDocument(
        'users',
        updateData,
        { "_id": true, "createdAt": true, "updatedAt": true, "salt": true, "version": true },
        true
    );

    // Security rules (SAME engine the middleware used) ──
    const securedUpdate = await securityRulesEngine.evalRoles(
        'users',
        validatedUpdate,
        currentDoc,
        userContext,
        true
    );

      
 const queryId = ObjectId.isValid(userId) ? new ObjectId(userId) : userId;

   const filter={_Id: queryId};
   const updateOperation= { $set: securedUpdate };
    
     //  Apply OCC Guard if enabled globally or on the schema
        if (frameworkConfig.schemaDefaults.optimisticConcurrencyControl) {
            const currentVersion = currentDoc.version || 1;
            filter.version = currentVersion;       // Lock to current version
            updateOperation.$inc = { version: 1 }; // Increment on success
        }
   //  Write 
    const result = await this.userCollection.updateOne(filter,updateOperation);
    if (result.modifiedCount === 0) {
        throw new AppError("No changes were made", 400);
    }

    // check if occ trigger and differeniat between OCC and not found 

      if (result.matchedCount === 0) {
            const docExists = await this.userCollection.findOne({ _id: queryId }, { projection: { _id: 1 } });
            if (docExists) {
                throw new AppError("Concurrent modification detected (OCC Conflict). Please refresh and try again.", 409);
            }
            throw new AppError("User not found", 404);
        }


    // ── Cache invalidation ──
    InvalidateUserCache(String(userId));

    return {
        success: true,
        message: "User updated successfully",
        data: { id: userId, ...securedUpdate }
    };
}

      /**
     * Delete a user account.
     * Respects frameworkConfig.schemaDefaults.softDocumentDelete:
     *  - Soft delete (default when enabled): archives the doc with a deletedAt timestamp
     *  - Hard delete: permanent removal (only via options.hardDelete, e.g. admin purge / GDPR)
     *
     * @param {string} userId - User ID to delete
     * @param {Object} [options]
     * @param {boolean} [options.hardDelete=false] - Force permanent removal
     * @returns {Promise<Object>}
     */
    async deleteUser(userId, options = {}) {
        const { hardDelete = false } = options;

        if (!this.userCollection) await this.init();

        const queryId = ObjectId.isValid(userId) ? new ObjectId(userId) : userId;
        const useSoftDelete = frameworkConfig.schemaDefaults.softDocumentDelete && !hardDelete;

        let result;

        if (useSoftDelete) {
            // ── Soft Delete: archive with deletedAt timestamp ──
            const updateOperation = { $set: { deletedAt: new Date() } };

            // Keep OCC contract intact
            if (frameworkConfig.schemaDefaults.optimisticConcurrencyControl) {
                updateOperation.$inc = { version: 1 };
            }

            // deletedAt guard prevents double soft-delete
            result = await this.userCollection.updateOne(
                { _id: queryId, deletedAt: { $exists: false } },
                updateOperation
            );

            if (result.matchedCount === 0) {
                // Distinguish "not found" from "already deleted"
                const exists = await this.userCollection.findOne(
                    { _id: queryId },
                    { projection: { _id: 1, deletedAt: 1 } }
                );
                if (exists && exists.deletedAt) {
                    throw new AppError("User is already deleted", 404);
                }
                throw new AppError("User not found", 404);
            }
        } else {
            // ── Hard Delete: permanent removal ──
            result = await this.userCollection.deleteOne({ _id: queryId });
            if (result.deletedCount === 0) {
                throw new AppError("User not found", 404);
            }
        }

        // Invalidate cache so the deleted user's token stops working immediately
        InvalidateUserCache(String(userId));

        return {
            success: true,
            hardDelete: !useSoftDelete,
            message: useSoftDelete
                ? "User soft deleted (archived)"
                : "User permanently deleted",
        };
    }

    /**
     * Admin-only permanent purge (GDPR / data removal).
     * Bypasses soft-delete and physically removes the document.
     */
    async purgeUser(userId) {
        return this.deleteUser(userId, { hardDelete: true });
    }

    /**
     * Change user password
     * @param {string} userId - User ID
     * @param {string} currentPassword - Current password for verification
     * @param {string} newPassword - New password
     * @returns {Object} - Result with new token
     */
    async changePassword(userId, currentPassword, newPassword) {
        if (!this.userCollection) {
            await this.init();
        }
 const queryId = ObjectId.isValid(userId) ? new ObjectId(userId) : userId;
        // Fetch current user
        const user = await this.userCollection.findOne({ _id: queryId });
        if (!user) {
            throw new AppError("User not found", 404);
        }
             // soft deletaion guard 
          if (frameworkConfig.schemaDefaults.softDocumentDelete && user.deletedAt) {
            throw new AppError("Cannot change password for a soft-deleted user", 400);
        }

        // Verify current password
        await this.verifyPassword(currentPassword, user);

        // Generate new salt and hash
        const newSalt = crypto.randomBytes(16).toString("hex");
        const newHashedPassword = await hashPassworNative(newPassword, newSalt);


          const filter = { _id: queryId };
        const updateOperation = {
            $set: {
                 $set: {
                    "accountInfo.passwordHash": newHashedPassword,
                    "accountInfo.password": newPassword,
                    "accountInfo.salt": newSalt,
                    "updatedAt": new Date()
                }
            }
        };

           if (frameworkConfig.schemaDefaults.optimisticConcurrencyControl) {
            filter.version = user.version || 1;
            updateOperation.$inc = { version: 1 };
        }


        // Update password in database
       const result= await this.userCollection.updateOne(filter,updateOperation);

         if (result.matchedCount === 0) {
            throw new AppError("Concurrent modification detected (OCC Conflict). Please try again.", 409);
        }

        //  Invalidate cache so old sessions are invalidated
        InvalidateUserCache(String(userId));

        // Generate new token (optional - forces re-login)
        const newToken = this.generateToken({
            _id: userId,
            accountInfo: user.accountInfo
        });

        return {
            success: true,
            message: "Password changed successfully. Please log in again.",
            token: newToken
        };
    }

    /**
     * Change user role (admin only)
     * @param {string} userId - User ID
     * @param {string} newRoleName - New role name
     * @returns {Object} - Result
     */
        async changeUserRole(userId, newRoleName) {
        if (!this.userCollection) await this.init();

        const queryId = ObjectId.isValid(userId) ? new ObjectId(userId) : userId;
        
        // Fetch to check existence, soft-delete, and get version
        const user = await this.userCollection.findOne({ _id: queryId });
        if (!user) throw new AppError("User not found", 404);
        
        if (frameworkConfig.schemaDefaults.softDocumentDelete && user.deletedAt) {
            throw new AppError("Cannot change role of a soft-deleted user", 400);
        }

        const filter = { _id: queryId };
        const updateOperation = { 
            $set: { "accountInfo.roleName": newRoleName, "updatedAt": new Date() } 
        };

        if (frameworkConfig.schemaDefaults.optimisticConcurrencyControl) {
            filter.version = user.version || 1;
            updateOperation.$inc = { version: 1 };
        }

        const result = await this.userCollection.updateOne(filter, updateOperation);

        if (result.matchedCount === 0) {
            throw new AppError("Concurrent modification detected (OCC Conflict) or user not found.", 409);
        }

        InvalidateUserCache(String(userId));
        return { success: true, message: "User role updated successfully" };
    }

async findAllUser(rbacScope=null,rbacOwnerId=null,){
    

      if (!this.userCollection) {
            await this.init();
        }
        const projection=Projection.getProjection(this.collectionName);
     const queryFilterd= {};
        
        if (rbacScope === 'OWN' && rbacOwnerId) {
            queryFilterd._id = new ObjectId(rbacOwnerId); // Force filter to user's own ID
        }
        
    
            if(frameworkConfig.schemaDefaults.softDocumentDelete){
                queryFilterd.deletedAt={$exists: false};
            }
    
    
         const data= await  this.userCollection.find(queryFilterd,{projection: projection}).toArray();
         const name=this.collectionName;
        
          return {

            success:true ,
            message:`${data.length?`Document Found in ${name}`:`No Document Found in ${name}`}` ,count: data.length,data};

            }

                /**
     * Fetch a single user by ID (read-only operation).
     *
     * Pipeline (mirrors BaseController.findById, but user-aware):
     *   1. Validate ID format         → 400 on malformed input
     *   2. Zero-DB-Hit self-fetch     → reuses cachedDoc (req.user) when reading own profile
     *   3. Soft-delete filter         → respects frameworkConfig.schemaDefaults.softDocumentDelete
   
     
     *
     * @param {string} userId - Target user ID (from req.params._id)
     * @param {Object} [options]
  
     * @param {Object|null} [options.cachedDoc]  - Authenticated user doc (req.user) for zero-DB-hit self-fetch
     * @param {boolean} [options.includeDeleted=false] - Allow reading soft-deleted users (admin tooling only)
     * @returns {Promise<Object>} Sanitized user document
     */
    async getUserById(userId, options = {}) {
     
        const { cachedDoc = null, includeDeleted = false } = options;

        if (!this.userCollection) await this.init();

        // ── Step 1: Fail fast on malformed IDs (same contract as BaseController) ──
        if (!ObjectId.isValid(userId)) {
            throw new AppError(
                "Bad Request: input must be a 24 character hex string, 12 byte Uint8Array, or an integer",
                400
            );
        }

        //  Zero-DB-Hit self-fetch .
        if (cachedDoc && String(cachedDoc._id) === String(userId)) {
            return cachedDoc;
        }

        // ──  Query filter with soft-delete guard ──
        const queryFilter = { _id: new ObjectId(userId) };
        if (frameworkConfig.schemaDefaults.softDocumentDelete && !includeDeleted) {
            queryFilter.deletedAt = { $exists: false };
        }
         const projection=Projection.getProjection(this.collectionName);

        // ── Fetch with security-safe projection ──
        const user = await this.userCollection.findOne(queryFilter, {
            projection: projection,
        });

        if (!user) {
            throw new AppError("No Document Found By This ID", 404);
        }

        // ── Step 5: Guarantee credentials never leave the service layer ──
        return user;
    }

   

    /**
     * Last line of defense: strips credential fields from ANY user document
     * before it leaves the service layer.
     * Covers edge cases like an inclusion projection on a nested parent
     * (e.g. { accountInfo: 1 }) which would otherwise leak the hash.
     * @private
     */
    #sanitizeUser(user) {
        const { accountInfo, ...rest } = user;
        if (!accountInfo) return { ...rest };

        const { passwordHash, salt, password, ...safeAccount } = accountInfo;
        return { ...rest, accountInfo: safeAccount };
    }
}

// Singleton instance
export const userService = new UserService("users");