import { User } from "../models/userModel.js";
import { Message } from "../models/messageModel.js";
import { ChatRoom } from "../models/chatRoomModel.js";
import mongoose from "mongoose";
export class MatchingService {
  constructor(io) {
    this.io = io;
  }

  async getUserNickname(userId) {
  try {
    let user;
    if (mongoose.isValidObjectId(userId)) {
      user = await User.findById(userId);
    } else {
      user = await User.findOne({ firebaseUid: userId });
    }

    return user?.nickname || "Unknown User";
  } catch (err) {
    console.error("getUserNickname error:", err);
    return "Unknown User";
  }
  }

  
  async getOrCreateChatRoom(userA, userB) {
    try {
      const sorted = [userA, userB].sort();
      const chatRoomId = `chat_${sorted[0]}_${sorted[1]}`;

      let chatRoom = await ChatRoom.findOne({ chatRoomId });
      if (!chatRoom) {
        chatRoom = new ChatRoom({
          chatRoomId,
          participants: [sorted[0], sorted[1]],
        });
        await chatRoom.save();
        console.log(`📌 Created new chatRoom: ${chatRoomId}`);
      }

      return chatRoom;
    } catch (err) {
      console.error("getOrCreateChatRoom error:", err);
      throw err;
    }
  }

  async saveMessage(chatRoomId, senderId, receiverId, message) {
    try {
      const messageObj = {
        chatRoomId,
        senderId,
        receiverId,
        message,
        timestamp: new Date(),
      };

      const newMessage = new Message(messageObj);
      await newMessage.save();
      return messageObj;
    } catch (err) {
      console.error("saveMessage error:", err);
      throw err;
    }
  }

  async getChatHistory(chatRoomId) {
    try {
      const mongoMessages = await Message.find({ chatRoomId })
        .sort({ timestamp: -1 })
        .limit(100);

      return mongoMessages.map((m) => ({
        senderId: m.senderId,
        message: m.message,
        timestamp: m.timestamp,
      }));
    } catch (err) {
      console.error("getChatHistory error:", err);
      return [];
    }
  }
}
