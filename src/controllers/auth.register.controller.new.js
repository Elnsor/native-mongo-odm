import { userService } from "../services/UserService.js";
import { AppError } from "../framework/appError.js";

/**
 * register new user
 */
export const register = async (req, res, next) => {
    try {
        // for valid body and user info 
        if (!req.body || !req.body.accountInfo?.password) {
            throw new AppError(
                "Validation Error: Password is required",
                400
            );
        }

        // Service Layer
        const result = await userService.registerUser(req.body);
       // console.log(result);
         if (result.writeErrors && result.writeErrors.length > 0) {
//   // Print the complete error detail without collapsing [Object]
    console.log(JSON.stringify(result.writeErrors[0].errInfo.details, null, 2));
         }

        // send responce
        res.status(201).json(result);
    } catch (err) {
        next(err);
    }
};