import express from "express"
import { login } from "../controllers/authLogin.controller.new.js"
import {rateLimit} from "express-rate-limit"

const loginRouter= express.Router();

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: {
        success: false,
        message: 'Too many login attempts, please try again after 15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false
});

loginRouter.get("/",(req,res)=>{
    res.status(200).send("Welcome To Login Page 👌");
});

loginRouter.post("/",authLimiter,login);

export default loginRouter