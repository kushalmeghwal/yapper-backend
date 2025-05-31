import { createClient } from 'redis';
import mongoose from 'mongoose';

// Redis client for real-time matching
const redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.connect().catch(console.error);

// MongoDB Message Schema
const messageSchema = new mongoose.Schema({
    chatRoomId: String,
    senderId: String,
    receiverId: String,
    message: String,
    timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', messageSchema);

export class MatchingService {
    constructor(io) {
        this.io = io;
        this.searchingUsers = new Map(); // userId -> { mood, type, socketId }
    }

    async startSearching(userId, type, mood, socketId) {
        // Store user's search preferences
        this.searchingUsers.set(userId, { type, mood, socketId });

        // Look for a matching user
        const match = await this.findMatch(userId, type, mood);
        
        if (match) {
            const chatRoomId = `chat_${Math.min(userId, match.userId)}_${Math.max(userId, match.userId)}`;
            
            // Notify both users about the match
            this.io.to(socketId).emit('matchFound', {
                chatRoomId,
                receiverId: match.userId,
                receiverNickname: match.nickname
            });
            
            this.io.to(match.socketId).emit('matchFound', {
                chatRoomId,
                receiverId: userId,
                receiverNickname: match.nickname
            });

            // Remove both users from searching pool
            this.searchingUsers.delete(userId);
            this.searchingUsers.delete(match.userId);
        }
    }

    async findMatch(userId, type, mood) {
        for (const [searchingUserId, data] of this.searchingUsers.entries()) {
            if (searchingUserId !== userId && 
                data.mood === mood && 
                data.type !== type) {
                return {
                    userId: searchingUserId,
                    socketId: data.socketId,
                    nickname: await this.getUserNickname(searchingUserId)
                };
            }
        }
        return null;
    }

    async getUserNickname(userId) {
        // Implement this method to fetch user nickname from your user database
        // This is a placeholder - replace with actual database query
        return "User" + userId.substring(0, 4);
    }

    async saveMessage(chatRoomId, senderId, receiverId, message) {
        try {
            const newMessage = new Message({
                chatRoomId,
                senderId,
                receiverId,
                message
            });
            await newMessage.save();
            
            // Store in Redis for real-time access
            await redisClient.lPush(`chat:${chatRoomId}`, JSON.stringify({
                senderId,
                message,
                timestamp: new Date()
            }));
            
            // Keep only last 100 messages in Redis
            await redisClient.lTrim(`chat:${chatRoomId}`, 0, 99);
        } catch (error) {
            console.error('Error saving message:', error);
        }
    }

    async getChatHistory(chatRoomId) {
        try {
            // Get messages from Redis
            const messages = await redisClient.lRange(`chat:${chatRoomId}`, 0, -1);
            return messages.map(msg => JSON.parse(msg));
        } catch (error) {
            console.error('Error getting chat history:', error);
            return [];
        }
    }

    stopSearching(userId) {
        this.searchingUsers.delete(userId);
    }
}
