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
connectDB;

// Create Express app
const app = express();
app.enable('trust proxy');
const server = createServer(app);

// Configure Socket.IO with proper CORS and options
const io = new Server(server, {
  cors: {
    origin: true, // Allow all origins for mobile app
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: ["*"]
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  allowEIO3: true
});

// Initialize Socket Handler
new SocketHandler(io);

// Port
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: true, // Allow all origins for mobile app
  credentials: true
}));
app.use(express.json());

// Mount routes
app.use('/api', userRoute);

// Default route
app.get('/', (req, res) => {
    res.send('Hello, server is running!');
});

// Start the server
server.listen(PORT, () => {
    console.log(`Server is running successfully on port ${PORT}`);
});
