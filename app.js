//import express
const express=require('express');
//initialise express in and as app
const app=express();

//import dotenv for env file ->for environment variables
require('dotenv').config();
const PORT=process.env.PORT || 3000;

//middleware -> converts body into json format
app.use(express.json());

//route

//database connection

//default route
app.get('/',(req,res)=>{
    res.send('hello');
});
app.listen(PORT,()=>{
    console.log(`app is running successfully on port no ${PORT}`);
});

