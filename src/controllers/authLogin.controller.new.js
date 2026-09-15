/**
 * I add userService 
 ### Befor add this user services
 * - it have about 10 responsibiliies 
 * - if i need to use it in different endpoint i must write diff code (not Reusability)
 * - its generate token i 2 diff places in authlogin and authregister
 * - its hard for testing 
 * ## after add userSerivce 
 * - its now Maintainability
 * - and add Separation of Concerns now thier controller layer and serivce layer user Business Logic (check for email and password and create new user ..etc ) 
 * - and easy for testing
 * 
 */
//==================================================
// ### login controller with UserService
//=================================================
import {userService}  from "../services/UserService.js"
import { AppError } from "../framework/appError.js";

/**
 * login
 */
export const login = async (req, res, next) => {
    try {
        // password email 
        if (!req.body || !(req.body.email && req.body.password)) {
            throw new AppError(
                "Validation Error: Please provide both Email and Password",
                400
            );
        }

        const { email, password } = req.body;

        // Service Layer inside it all bussiness logic 
        const result = await userService.loginUser(email, password);


        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
};