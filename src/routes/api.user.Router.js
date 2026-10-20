// src/routes/user.routes.js

import express from "express";
import { tokenauth } from "../middleware/authMeddlware.js";
import { authorizeCheck } from "../middleware/authorizeCheck.js";
import validator from "../middleware/validate.js";
import validationCollection from "../middleware/appRolesMeddlware.js";
import { TYPE_IDS } from "../rbac/constant/resourceType.js";
import { requireRole } from "../middleware/requiredRole.js";
import {
    updateUser,
    deleteUser,
    changePassword,
    changeUserRole,
    getUserById,
    findAllUsers
} from "../controllers/user.controller.js";


const userRouter = express.Router();

const authOptions = {
    parentTypePid: TYPE_IDS.COLLECTIONS,
    parentInsName: "users",
    childTypePid:TYPE_IDS.DOCUMENTS,
    childInsName: null,
    ownerFie: '_id',
};

// Read a user (self-fetch hits ZERO DB queries thanks to cachedDoc)
userRouter.get(
    "/:_id",
    tokenauth,
    authorizeCheck('READ', authOptions),
    getUserById
);
userRouter.get(
    "/",
    tokenauth,
    authorizeCheck('READ', authOptions),
    findAllUsers
);

//  User-specific routes with cache invalidation
userRouter.put(
    "/:_id",
    tokenauth,
    authorizeCheck('UPDATE', authOptions),
    updateUser  
);

userRouter.delete(
    "/:_id",
    tokenauth,
    authorizeCheck('DELETE', authOptions),
    deleteUser
);

userRouter.post(
    "/change-password",
    tokenauth,
    authorizeCheck('UPDATE', authOptions),
    changePassword  
);

userRouter.patch(
    "/:_id/role",
    tokenauth,
    requireRole('ADMIN'),
    authorizeCheck('UPDATE', authOptions), // Only admins
    changeUserRole  
);

export default userRouter;