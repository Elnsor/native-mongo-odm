// src/controllers/user.controller.js

import { userService } from "../services/UserService.js";
import { AppError } from "../framework/appError.js";

/**
 * Update user profile
 */
export const updateUser = async (req, res, next) => {
    try {
        const userId = req.params._id;
        const updateData = req.body;
        
        // Build user context from authenticated user
        const userContext = {
            role: [req.user.accountInfo.roleName]
        };

        const result = await userService.updateUser(userId, req.user, updateData, userContext);
        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
};

/**
 * Delete user account
 */
export const deleteUser = async (req, res, next) => {
    try {
        const userId = req.params._id;
        const result = await userService.deleteUser(userId);
        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
};

/**
 * Change user password
 */
export const changePassword = async (req, res, next) => {
    try {
        const userId = req.user._id; // Can only change own password
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            throw new AppError("Both currentPassword and newPassword are required", 400);
        }

        const result = await userService.changePassword(userId, currentPassword, newPassword);
        res.status(200).json(result);
    } catch (err) {
        console.log(err);
        next(err);
    }
};

/**
 * Change user role (admin only)
 */
export const changeUserRole = async (req, res, next) => {
    try {
        const userId = req.params._id;
        const { roleName } = req.body;

        if (!roleName) {
            throw new AppError("roleName is required", 400);
        }

        const result = await userService.changeUserRole(userId, roleName);
        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
}
    // find 
 export  const findAllUsers =  async (req,res,next) => {
    try {
            const result=await userService.findAllUser(req.projection,req.rbacScope,req.rbacOwnerId);
           
          
            res.status(200).json(result);
        
        }catch(err){
            next(err);

        
        }
 }
/**
 * Fetch a user by ID (self or others, per RBAC boundary)
 */
export const getUserById = async (req, res, next) => {
    try {
        const data = await userService.getUserById(req.params._id, {
            cachedDoc: req.user,                 // enables zero-DB-hit self-fetch
        });

        res.status(200).json({ success: true, data });
    } catch (err) {
        next(err);
    }
};
  
        
    
