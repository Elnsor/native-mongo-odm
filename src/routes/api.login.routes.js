import express from "express"
import { login } from "../controllers/authLogin.controller.js"

const loginRouter= express.Router();

loginRouter.get("/",(req,res)=>{
    res.status(200).send("Welcome To Login Page 👌");
});

loginRouter.post("/",login);

export default loginRouter