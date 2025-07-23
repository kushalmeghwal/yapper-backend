import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import connectDB from './config/database.js';
import userRoute from './routes/userRoute.js';
import 'dotenv/config';
import { SocketHandler } from "./socket/socketHandler.js";

const startServer = async () => {
  await connectDB();

  // Create Express app
  const app = express();
  app.enable('trust proxy');
  const server = createServer(app);

  // Configure Socket.IO
  const io = new Server(server, {
    cors: {
      origin: "*",
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

  const PORT = process.env.PORT || 3000;

  // Middleware
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());

  // Routes
  app.use('/api', userRoute);

  // Default route
  app.get('/', (req, res) => {
    res.send('Hello, server is running!');
  });

  // Start server
  server.listen(PORT, () => {
    console.log(`Server is running successfully on port ${PORT}`);
  });
};

startServer(); 
