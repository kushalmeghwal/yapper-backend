import { createClient } from 'redis';
import mongoose from 'mongoose';
import { User } from '../models/userModel.js';

// Redis client for real-time matching
const redisClient = createClient({
    url: process.env.REDIS_URL 
});

try {
    redisClient.connect();
    console.log('Connected to Redis');
} catch (error) {
    console.error('Error connecting to Redis:', error);
}

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
        console.log(`User ${userId} started searching with type ${type} and mood ${mood}`);
        
        // Store user's search preferences
        this.searchingUsers.set(userId, { type, mood, socketId });
        
        // Log current searching users
        console.log('Updated users searching:', Array.from(this.searchingUsers.entries()));

        // Look for a matching user
        const match = await this.findMatch(userId, type, mood);
        
        if (match) {
            console.log(`Match found between ${userId} and ${match.userId}`);
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
                receiverNickname: nickname
            });

            // Remove both users from searching pool
            this.searchingUsers.delete(userId);
            this.searchingUsers.delete(match.userId);
            
            // Log updated searching users
            console.log('Updated users searching after match:', Array.from(this.searchingUsers.entries()));
        } else {
            console.log(`No match found for user ${userId}`);
        }
    }

    async findMatch(userId, type, mood) {
        console.log('Finding match for:', { userId, type, mood });
        console.log('Current searching users:', Array.from(this.searchingUsers.entries()));

        for (const [searchingUserId, data] of this.searchingUsers.entries()) {
            // Skip if it's the same user
            if (searchingUserId === userId) continue;

            console.log('Checking potential match:', {
                searchingUserId,
                searchingType: data.type,
                searchingMood: data.mood,
                currentType: type,
                currentMood: mood
            });

            // Match if moods are same and types are different
            if (data.mood === mood && data.type !== type) {
                console.log('Match found!');
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
        try {
            const user = await User.findById(userId);
            if (!user) {
                console.error('User not found:', userId);
                return "Unknown User";
            }
            return user.nickname;
        } catch (error) {
            console.error('Error getting user nickname:', error);
            return "Unknown User";
        }
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
        console.log(`User ${userId} stopped searching`);
        this.searchingUsers.delete(userId);
        console.log('Updated users searching:', Array.from(this.searchingUsers.entries()));
    }
}
