// socket/socketHandler.js
import { MatchingService } from "./matchingService.js";
import { ChatRoom } from "../models/chatRoomModel.js";
import { User } from "../models/userModel.js";

export class SocketHandler {
  constructor(io) {
    this.io = io;
    this.matchingService = new MatchingService(io);

    // userId -> socket (only last connected socket)
    this.socketsByUser = new Map();

    // online users set
    this.onlineUsers = new Set();

    // searching users: userId -> { type, mood, socket, timeout }
    this.searchingUsers = new Map();

    // message dedupe
    this.messageDeliveryStatus = new Map();

    console.log("setupSocketHandlers CALLED");

    this.io.on("connection", (socket) => this.registerSocketEvents(socket));
  }

  logUsers() {
    console.log("Online Users:", Array.from(this.onlineUsers.values()));
    console.log("Searching Users:", Array.from(this.searchingUsers.keys()));
  }

  handleJoin(socket, userId) {
    if (!userId) return;
    socket.userId = userId;

    // store socket reference (overwrite if user reconnects)
    this.socketsByUser.set(userId, socket);

    this.onlineUsers.add(userId);
    console.log(`User ${userId} joined with socket ${socket.id}`);
    this.logUsers();
  }

  handleUserOnline(socket, userId) {
    if (!userId) return;
    socket.userId = userId;
    this.socketsByUser.set(userId, socket);
    this.onlineUsers.add(userId);

    console.log(`User with userId: ${userId} is online`);
    this.logUsers();
  }

  async handleJoinRoom(socket, { chatRoomId, userId }) {
    if (!chatRoomId || !userId) return;

    try {
      const chatRoom = await ChatRoom.findOne({ chatRoomId }).lean();
      if (!chatRoom || !chatRoom.participants.includes(userId)) {
        console.warn("joinRoom denied:", { chatRoomId, userId });
        return;
      }

      // Prevent multiple joins
      if (!socket.rooms.has(chatRoomId)) {
        socket.join(chatRoomId);
        console.log(`User ${userId} joined chatRoom ${chatRoomId}`);
      }
    } catch (err) {
      console.error("joinRoom error:", err);
    }
  }

  async handleLeaveRoom(socket, { chatRoomId, userId }) {
    if (!chatRoomId || !userId) return;
    try {
      const chatRoom = await ChatRoom.findOne({ chatRoomId }).lean();
      if (!chatRoom || !chatRoom.participants.includes(userId)) return;

      socket.leave(chatRoomId);
      this.onlineUsers.add(userId);

      console.log(`User ${userId} left chatRoom ${chatRoomId}`);
      this.logUsers();
    } catch (err) {
      console.error("leaveRoom error:", err);
    }
  }

  handleStartSearching(socket, { userId, type, mood }) {
    if (!userId || !type || !mood) return;
    console.log(`Search request from ${userId}: { type: ${type}, mood: ${mood} }`);

    this.socketsByUser.set(userId, socket);
    this.onlineUsers.delete(userId);

    if (this.searchingUsers.has(userId)) {
      clearTimeout(this.searchingUsers.get(userId).timeout);
      this.searchingUsers.delete(userId);
    }

    const timeout = setTimeout(() => {
      if (this.searchingUsers.has(userId)) {
        this.searchingUsers.delete(userId);
        this.onlineUsers.add(userId);
        const s = this.socketsByUser.get(userId);
        if (s) s.emit("searchTimeout", { message: "No match found, back online." });
        console.log(`User ${userId} search timed out, moved back to online.`);
        this.logUsers();
      }
    }, 60 * 1000);

    this.searchingUsers.set(userId, { type, mood, socket, timeout });
    this.matchUsers();
    this.logUsers();
  }

  handleStopSearching(userId) {
    if (!userId) return;
    if (this.searchingUsers.has(userId)) {
      const { timeout } = this.searchingUsers.get(userId);
      clearTimeout(timeout);
      this.searchingUsers.delete(userId);
    }
    if (this.socketsByUser.has(userId)) this.onlineUsers.add(userId);

    console.log(`User ${userId} stopped searching and is back online.`);
    this.logUsers();
  }

  async matchUsers() {
    const entries = Array.from(this.searchingUsers.entries());
    if (entries.length < 2) return;

    for (let i = 0; i < entries.length - 1; i++) {
      const [idA, aData] = entries[i];
      for (let j = i + 1; j < entries.length; j++) {
        const [idB, bData] = entries[j];

        if (aData.mood === bData.mood && aData.type !== bData.type) {
          clearTimeout(aData.timeout);
          clearTimeout(bData.timeout);

          const chatRoom = await this.matchingService.getOrCreateChatRoom(idA, idB);
          const chatRoomId = chatRoom.chatRoomId;

          const nicknameA = await this.matchingService.getUserNickname(idA);
          const nicknameB = await this.matchingService.getUserNickname(idB);

          // emit match to both
          aData.socket.emit("matchFound", { chatRoomId, receiverId: idB, receiverNickname: nicknameB });
          bData.socket.emit("matchFound", { chatRoomId, receiverId: idA, receiverNickname: nicknameA });

          // update states
          this.onlineUsers.delete(idA);
          this.onlineUsers.delete(idB);
          this.searchingUsers.delete(idA);
          this.searchingUsers.delete(idB);

          console.log(`Matched ${idA} with ${idB} in ${chatRoomId}`);
          this.logUsers();
          return;
        }
      }
    }
  }

  async handleSendMessage(socket, { chatRoomId, senderId, receiverId, message, timestamp }) {
    if (!chatRoomId || !senderId || !receiverId || !message) return;

    try {
      const msgTimestamp = timestamp || new Date().toISOString();
      const messageId = `${chatRoomId}_${senderId}_${msgTimestamp}`;
      if (this.messageDeliveryStatus.has(messageId)) return;
      this.messageDeliveryStatus.set(messageId, true);

      // Clean old entries
      if (this.messageDeliveryStatus.size > 1000) {
        const keysToDelete = Array.from(this.messageDeliveryStatus.keys()).slice(0, this.messageDeliveryStatus.size - 1000);
        keysToDelete.forEach((k) => this.messageDeliveryStatus.delete(k));
      }

      // Save message
      const savedMessage = await this.matchingService.saveMessage(chatRoomId, senderId, receiverId, message);

      // Emit to sender
      const senderSocket = this.socketsByUser.get(senderId);
      if (senderSocket) senderSocket.emit("receiveMessage", savedMessage);

      // Emit to receiver (if different socket)
      const receiverSocket = this.socketsByUser.get(receiverId);
      if (receiverSocket && receiverSocket.id !== senderSocket?.id) {
        receiverSocket.emit("receiveMessage", savedMessage);
      }

      console.log(`Message sent from ${senderId} to ${receiverId}: "${message}"`);
    } catch (err) {
      console.error("Error handling message:", err);
      socket.emit("messageError", { error: "Failed to send message" });
    }
  }

  async handleGetChatHistory(socket, { chatRoomId }) {
    if (!chatRoomId) return;
    try {
      const messages = await this.matchingService.getChatHistory(chatRoomId);
      socket.emit("chatHistory", [...messages].reverse());
    } catch (err) {
      console.error("getChatHistory error:", err);
    }
  }

  async handleGetAllChats(socket, { userId }) {
    if (!userId) return;
    try {
      const chatRooms = await ChatRoom.find({ participants: userId }).lean();
      const chats = await Promise.all(
        chatRooms.map(async (room) => {
          const lastMessage = await (await import("../models/messageModel.js")).Message
            .findOne({ chatRoomId: room.chatRoomId })
            .sort({ timestamp: -1 });
          const receiverId = room.participants.find((p) => p !== userId);
          const receiverNickname = await this.matchingService.getUserNickname(receiverId);
          return {
            chatRoomId: room.chatRoomId,
            receiverId,
            receiverNickname,
            lastMessage: lastMessage?.message || "",
            lastMessageTime: lastMessage?.timestamp || room.createdAt,
          };
        })
      );
      socket.emit("allChats", chats);
    } catch (err) {
      console.error("Error fetching all chats:", err);
      socket.emit("error", { message: "Failed to fetch chat list" });
    }
  }

  handleDisconnect(socket, reason) {
    const userId = socket.userId;
    if (!userId) return;

    this.socketsByUser.delete(userId);
    this.onlineUsers.delete(userId);

    if (this.searchingUsers.has(userId)) {
      clearTimeout(this.searchingUsers.get(userId).timeout);
      this.searchingUsers.delete(userId);
    }

    console.log(`User ${userId} disconnected. Reason: ${reason}`);
    this.logUsers();
  }

  registerSocketEvents(socket) {
    socket.on("join", (userId) => this.handleJoin(socket, userId));
    socket.on("userOnline", (userId) => this.handleUserOnline(socket, userId));

    socket.on("joinRoom", (data) => this.handleJoinRoom(socket, data));
    socket.on("leaveRoom", (data) => this.handleLeaveRoom(socket, data));

    socket.on("startSearching", (data) => this.handleStartSearching(socket, data));
    socket.on("stopSearching", (userId) => this.handleStopSearching(userId));

    socket.on("sendMessage", (data) => this.handleSendMessage(socket, data));
    socket.on("getChatHistory", (data) => this.handleGetChatHistory(socket, data));
    socket.on("getAllChats", (data) => this.handleGetAllChats(socket, data));

    socket.on("disconnect", (reason) => this.handleDisconnect(socket, reason));
    socket.on("ping", () => socket.emit("pong"));
  }
}
