import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
// Import database file
import connectDB from './config/database.js';
import {User} from './models/userModel.js';  // Import User model to fetch nicknames

// Import routes
import userRoute from './routes/userRoute.js';

// Import dotenv for environment variables
import 'dotenv/config';

import {SocketHandler} from "./socket/socketHandler.js";
connectDB();
//import socket
// Create Express app
const app = express();
app.enable('trust proxy');
//using https always for real world application
app.use((req, res, next) => {
  if (req.protocol === 'http') {
    return res.redirect(`https://${req.headers.host}${req.url}`);
  }
  next();
});
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// In server.js or app.js
// or wherever it's defined
new SocketHandler(io);

// Port
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Mount routes
app.use('/api', userRoute);

// Default route
app.get('/', (req, res) => {
    res.send('Hello, server is running!');
});

// Start the server
server.listen(PORT, () => {
    console.log(` Server is running successfully on port ${PORT}`);
});
