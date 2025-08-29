import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import cookieParser from "cookie-parser";
import connectDB from "./config/database.js";
import userRoute from "./routes/userRoute.js";
import { SocketHandler } from "./socket/socketHandler.js";
import "dotenv/config";

const startServer = async () => {
  await connectDB();

  // Create Express app
  const app = express();
  app.enable("trust proxy");

  // Middleware (order matters)
  app.use(cookieParser());
  app.use(
    cors({
      origin:process.env.YAPPER_WEB, // frontend
      credentials: true,              // allow cookies
    })
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));


  // Create HTTP server
  const server = createServer(app);

  // Configure Socket.IO
  const io = new Server(server, {
    cors: {
      origin: process.env.YAPPER_WEB,
      methods: ["GET", "POST","PUT"],
      credentials: true,
      allowedHeaders: ["*"],
    },
    transports: ["websocket", "polling"],
    pingTimeout: 60000,
    pingInterval: 25000,
    allowEIO3: true,
  });

  // Initialize Socket Handler
  new SocketHandler(io);

  // Routes
  app.use("/api", userRoute);

  // Default route
  app.get("/", (req, res) => {
    res.send("Hello, server is running!");
  });

  // Start server
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Server is running successfully on port ${PORT}`);
  });
};

startServer();
