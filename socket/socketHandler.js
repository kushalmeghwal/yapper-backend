import mongoose from "mongoose";
import { MatchingService } from "./matchingService.js";
import { ChatRoom } from "../models/chatRoomModel.js";
import { Message } from "../models/messageModel.js";
import { User } from "../models/userModel.js";

export class SocketHandler {
  constructor(io) {
    this.io = io;
    this.matchingService = new MatchingService(io);
    this.activeUsers = new Map(); // userId -> socketId
    this.messageDeliveryStatus = new Map(); // Track message delivery status
    this.setupSocketHandlers();
  }

  async createOrGetChatRoom(user1Id, user2Id) {
    try {
      const existingRoom = await ChatRoom.findOne({
        participants: { $all: [user1Id, user2Id], $size: 2 },
      });

      if (existingRoom) {
        return existingRoom;
      }

      const newRoom = await ChatRoom.create({
        participants: [user1Id, user2Id],
      });

      return newRoom;
    } catch (err) {
      console.error("Error in createOrGetChatRoom:", err);
      throw err;
    }
  }


  setupSocketHandlers() {
    console.log("setupSocketHandlers CALLED");
    this.io.on("connection", (socket) => {
      console.log("User connected:", socket.id);

      socket.on("join", (userId) => {
        socket.userId = userId;
        socket.join(userId);
        this.activeUsers.set(userId, socket);
        this.matchingService.setUserOnline(userId, socket.id);
        console.log(`User ${userId} joined with socket ID ${socket.id}`);
        console.log("Active users:", Array.from(this.activeUsers.entries()));
      });
      
      // ✅ Handle userOnline
      socket.on('userOnline', async (userId) => {
        socket.userId = userId;
        console.log(`User ${userId} is online with socket ${socket.id}`);
   
        
        if (this.activeUsers.has(userId)) {
          const oldSocket = this.activeUsers.get(userId);
          if (oldSocket.id !== socket.id) {
            oldSocket.disconnect(); // disconnect old socket
          }
        }
        this.activeUsers.set(userId, socket);
        this.matchingService.setUserOnline(userId,socket.id);
        socket.userId = userId;
        console.log(`User ${userId} marked online via userOnline event`);
        console.log("Active users:", Array.from(this.activeUsers.entries()));
      });

   socket.on('join_chat', async ({ chatRoomId, userId }) => {
  if (!chatRoomId || !userId) {
    console.error("join_chat: Missing chatRoomId or userId");
    return;
  }

  try {
    const chatRoom = await ChatRoom.findById(chatRoomId);
    if (!chatRoom) {
      console.error(`join_chat: Chat room not found for ID ${chatRoomId}`);
      return;
    }

    if (!chatRoom.participants.includes(userId)) {
      console.warn(`join_chat: User ${userId} is not a participant of chatRoom ${chatRoomId}`);
      return;
    }

    socket.join(chatRoomId);
    console.log(`User ${userId} joined chatRoom ${chatRoomId}`);
  } catch (err) {
    console.error("join_chat error:", err);
  }
});

socket.on('leave_chat', async ({ chatRoomId, userId }) => {
  if (!chatRoomId || !userId) {
    console.error("leave_chat: Missing chatRoomId or userId");
    return;
  }

  try {
    const chatRoom = await ChatRoom.findById(chatRoomId);
    if (!chatRoom) {
      console.error(`leave_chat: Chat room not found for ID ${chatRoomId}`);
      return;
    }

    if (!chatRoom.participants.includes(userId)) {
      console.warn(`leave_chat: User ${userId} is not a participant of chatRoom ${chatRoomId}`);
      return;
    }

    socket.leave(chatRoomId);
    console.log(`User ${userId} left chatRoom ${chatRoomId}`);
  } catch (err) {
    console.error("leave_chat error:", err);
  }
});


      socket.on("ping", () => {
        socket.emit("pong");
      });

      socket.on("startSearching", ({ userId, type, mood }) => {
        console.log(`Search request from user ${userId}:`, { type, mood });
        if (!userId || !type || !mood) {
          console.error("Invalid search request:", { userId, type, mood });
          return;
        }
        this.matchingService.startSearching(userId, type, mood, socket.id);
      });

      socket.on("stopSearching", (userId) => {
        if (!userId) {
          console.error("Invalid stop search request: userId is missing");
          return;
        }
        this.matchingService.stopSearching(userId);
      });

      socket.on(
        "sendMessage",
        async ({ chatRoomId, senderId, receiverId, message, timestamp }) => {
          if (
            !chatRoomId ||
            !senderId ||
            !receiverId ||
            !message ||
            !timestamp
          ) {
            console.error("Invalid message data:", {
              chatRoomId,
              senderId,
              receiverId,
              message,
              timestamp,
            });
            return;
          }

          console.log(`Message from ${senderId} to ${receiverId}: ${message}`);

          try {
            const messageId = `${chatRoomId}_${senderId}_${timestamp}`;

            if (this.messageDeliveryStatus.has(messageId)) {
              console.log("Duplicate message detected, ignoring:", messageId);
              return;
            }

            this.messageDeliveryStatus.set(messageId, true);

            if (this.messageDeliveryStatus.size > 1000) {
              const keysToDelete = Array.from(
                this.messageDeliveryStatus.keys()
              ).slice(0, this.messageDeliveryStatus.size - 1000);
              keysToDelete.forEach((key) =>
                this.messageDeliveryStatus.delete(key)
              );
            }

            const savedMessage = await this.matchingService.saveMessage(
              chatRoomId,
              senderId,
              receiverId,
              message,
              timestamp
            );
            console.log("Message saved:", savedMessage);

            const senderSocketId =
              this.matchingService.getUserSocketId(senderId);
            const receiverSocketId =
              this.matchingService.getUserSocketId(receiverId);

            if (senderSocketId) {
              this.io.to(senderSocketId).emit("receiveMessage", savedMessage);
              console.log("Message confirmation sent to sender:", senderId);
            }

            if (receiverSocketId) {
              this.io.to(receiverSocketId).emit("receiveMessage", savedMessage);
              console.log("Message delivered to receiver:", receiverId);
            } else {
              console.log(
                `Receiver ${receiverId} is offline, message will be available when they come online`
              );
            }

            console.log("Message handling completed");
          } catch (error) {
            console.error("Error handling message:", error);
            socket.emit("messageError", { error: "Failed to send message" });
          }
        }
      );

      socket.on("getChatHistory", async ({ chatRoomId }) => {
        if (!chatRoomId) {
          console.error("Invalid chat history request: chatRoomId is missing");
          return;
        }
        try {
          const messages = await this.matchingService.getChatHistory(chatRoomId);
          const reversedMessages = [...messages].reverse(); 
          console.log("Sending chat history:", reversedMessages);
          socket.emit("chatHistory", reversedMessages);
        } catch (error) {
          console.error("Error getting chat history:", error);
          socket.emit("error", { message: "Failed to get chat history" });
        }
      });

      socket.on("getAllChats", async (data) => {
        try {
          const userId=data.userId;
           const chatRooms = await ChatRoom.find({ participants: userId}).lean();

          const chats = await Promise.all(
            chatRooms.map(async (room) => {
              const lastMessage = await Message.findOne({ chatRoomId: room._id,})
              .sort({ timestamp: -1 });

              const receiverId = room.participants.find((p) => p !== userId);
              const receiver = await User.findById(receiverId);

              return {
                chatRoomId: room._id.toString(),
                receiverId: receiver._id.toString(),
                receiverNickname: receiver.nickname,
                lastMessage: lastMessage?.content || "",
                lastMessageTime: lastMessage?.timestamp || room.createdAt,
              };
            })
          );

          socket.emit("allChats", chats);
        } catch (err) {
          console.error("Error fetching all chats:", err);
          socket.emit("error", { message: "Failed to fetch chat list" });
        }
      });

  socket.on("disconnect", (reason) => {
  const userId = socket.userId;
  if (userId) {
    const current = this.activeUsers.get(userId);

    // Only delete if the same socket
    if (current && current.id === socket.id) {
      this.activeUsers.delete(userId);
      this.matchingService.setUserOffline(userId);
      this.matchingService.stopSearching(userId);

      console.log(`User ${userId} disconnected. Reason: ${reason}`);
      console.log("Updated active users:", Array.from(this.activeUsers.entries()));
    }
  }
});

    });
  }
}
