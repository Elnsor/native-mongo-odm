import express from "express"
import { register } from "../controllers/auth.register.controller.new.js";
import {rateLimit} from "express-rate-limit"

const registerRouter= express.Router();


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

registerRouter.get("/",(req,res)=>{
    res.status(200).send("Welcome To register Page 👌");
});

registerRouter.post("/",authLimiter,register);

export default registerRouter