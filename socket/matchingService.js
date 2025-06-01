import { createClient } from 'redis';
import mongoose from 'mongoose';
import { User } from '../models/userModel.js';

// Redis client for real-time matching
let redisClient;
try {    
    redisClient = createClient({
        url: process.env.REDIS_URL,
        socket: {
            tls: true,
            rejectUnauthorized: false
        }
    });

    // Handle Redis connection events
    redisClient.on('error', (err) => {
        console.error('Redis Client Error:', err.message);
        console.error('Error details:', err);
    });

    redisClient.on('connect', () => {
        console.log('Successfully connected to Redis');
    });

    redisClient.on('end', () => {
        console.log('Redis connection ended');
    });

    // Connect to Redis
    (async () => {
        try {
            await redisClient.connect();
        } catch (error) {
            console.error('Failed to connect to Redis:', error.message);
            console.error('Connection error details:', error);
        }
    })();
} catch (error) {
    console.error('Redis configuration error:', error.message);
    console.error('Configuration error details:', error);
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
        
        // Validate inputs
        if (!userId || !type || !mood || !socketId) {
            console.error('Invalid search parameters:', { userId, type, mood, socketId });
            return;
        }
        
        // Store user's search preferences
        this.searchingUsers.set(userId, { type, mood, socketId });
        
        // Log current searching users
        console.log('Updated users searching:', Array.from(this.searchingUsers.entries()));

        // Look for a matching user
        const match = await this.findMatch(userId, type, mood);
        
        if (match) {
            console.log(`Match found between ${userId} and ${match.userId}`);
            
            // Generate chat room ID using sorted user IDs to ensure consistency
            const sortedUserIds = [userId, match.userId].sort();
            const chatRoomId = `chat_${sortedUserIds[0]}_${sortedUserIds[1]}`;
            console.log('Generated chat room ID:', chatRoomId);
            
            // Get nicknames for both users
            const userNickname = await this.getUserNickname(userId);
            const matchNickname = await this.getUserNickname(match.userId);
            
            // Notify both users about the match
            this.io.to(socketId).emit('matchFound', {
                chatRoomId,
                receiverId: match.userId,
                receiverNickname: matchNickname
            });
            
            this.io.to(match.socketId).emit('matchFound', {
                chatRoomId,
                receiverId: userId,
                receiverNickname: userNickname
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
            console.log('Saving message:', { chatRoomId, senderId, receiverId, message });
            
            // Create message object with timestamp
            const messageObj = {
                chatRoomId,
                senderId,
                receiverId,
                message,
                timestamp: new Date()
            };

            // Save to MongoDB
            const newMessage = new Message(messageObj);
            await newMessage.save();
            console.log('Message saved to MongoDB');
            
            // Store in Redis for real-time access
            await redisClient.lPush(`chat:${chatRoomId}`, JSON.stringify(messageObj));
            console.log('Message saved to Redis');
            
            // Keep only last 100 messages in Redis
            await redisClient.lTrim(`chat:${chatRoomId}`, 0, 99);

            // Return the message object for immediate emission
            return messageObj;
        } catch (error) {
            console.error('Error saving message:', error);
            throw error; // Propagate error to caller
        }
    }

    async getChatHistory(chatRoomId) {
        try {
            console.log('Getting chat history for room:', chatRoomId);
            
            // Try Redis first
            const redisMessages = await redisClient.lRange(`chat:${chatRoomId}`, 0, -1);
            if (redisMessages && redisMessages.length > 0) {
                console.log('Retrieved messages from Redis');
                return redisMessages.map(msg => JSON.parse(msg));
            }

            // If Redis is empty, try MongoDB
            console.log('No messages in Redis, checking MongoDB');
            const mongoMessages = await Message.find({ chatRoomId })
                .sort({ timestamp: -1 })
                .limit(100);
            
            if (mongoMessages && mongoMessages.length > 0) {
                console.log('Retrieved messages from MongoDB');
                // Store in Redis for future access
                const messages = mongoMessages.map(msg => ({
                    senderId: msg.senderId,
                    message: msg.message,
                    timestamp: msg.timestamp
                }));
                
                // Store in Redis
                for (const msg of messages) {
                    await redisClient.lPush(`chat:${chatRoomId}`, JSON.stringify(msg));
                }
                await redisClient.lTrim(`chat:${chatRoomId}`, 0, 99);
                
                return messages;
            }

            console.log('No messages found in either Redis or MongoDB');
            return [];
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
