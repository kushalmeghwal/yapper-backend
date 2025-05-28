import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

// Import routes
import userRoute from './routes/userRoute.js';

// Import dotenv for environment variables
import 'dotenv/config';

// Import database file
import connectDB from './config/database.js';
import {User} from './models/userModel.js';  // Import User model to fetch nicknames

//import socket
import socketHandler from "./socket/webSocket.js";
app.enable('trust proxy');
// Create Express app
const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use((req, res, next) => {
  if (req.protocol === 'http') {
    return res.redirect(`https://${req.headers.host}${req.url}`);
  }
  next();
});

socketHandler(io); 
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
