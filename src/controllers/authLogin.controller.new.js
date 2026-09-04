

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

        // Service Layer
        const result = await userService.loginUser(email, password);


        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
};