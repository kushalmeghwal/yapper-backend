//import express
const express=require('express');

//initialise express in and as app
const app=express();

//cookie-parser
const cookieParser = require('cookie-parser');
app.use(cookieParser());

//import dotenv for env file ->for environment variables
require('dotenv').config();
const PORT=process.env.PORT || 3000;

//middleware -> converts body into json format
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

//mount the route
const userRoute = require('./routes/userRoute');
app.use('/api', userRoute);

//database connection
const connectDB = require('./config/database');
connectDB();

//default route
app.get('/',(req,res)=>{
    res.send('hello');
});
//start the server
app.listen(PORT,()=>{
    console.log(`app is running successfully on port no ${PORT}`);
});

