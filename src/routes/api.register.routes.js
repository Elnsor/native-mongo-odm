import express from "express"
import { register } from "../controllers/authRegister.contoller.js";

const registerRouter= express.Router();

registerRouter.get("/",(req,res)=>{
    res.status(200).send("Welcome To register Page 👌");
});

registerRouter.post("/",register);

export default registerRouter