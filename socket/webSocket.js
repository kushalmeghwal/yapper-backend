import { Server } from 'socket.io';
import matchingService from './matchingService.js';
import { Message, ChatRoom } from '../models/chatModel.js';
import { User } from '../models/userModel.js';
import redisClient from '../config/redis.js';

export default (io) => {
    io.on('connection', (socket) => {
        console.log('User connected:', socket.id);

        // Handle search request
        socket.on('start_search', async ({ userId, mood, choice }) => {
            try {
                // Verify user exists and is logged in
                const user = await User.findById(userId);
                if (!user) {
                    socket.emit('error', { message: 'User not found' });
                    return;
                }

                // Add to waiting list and try to find match
                const matchResult = await matchingService.addToWaitingList(userId, mood, choice);
                
                if (matchResult.matched) {
                    // Create chat room
                    const chatRoomId = `chat_${userId}_${matchResult.matchedUserId}`;
                    
                    // Create chat room in MongoDB
                    await ChatRoom.create({
                        chatRoomId,
                        participants: [userId, matchResult.matchedUserId]
                    });

                    // Get user nicknames
                    const [user1, user2] = await Promise.all([
                        User.findById(userId),
                        User.findById(matchResult.matchedUserId)
                    ]);

                    // Notify both users
                    io.to(socket.id).emit('match_found', {
                        chatRoomId,
                        receiverId: matchResult.matchedUserId,
                        receiverNickname: user2.nickname
                    });

                    // Find the other user's socket
                    const otherUserSocket = Array.from(io.sockets.sockets.values())
                        .find(s => s.userId === matchResult.matchedUserId);

                    if (otherUserSocket) {
                        otherUserSocket.emit('match_found', {
                            chatRoomId,
                            receiverId: userId,
                            receiverNickname: user1.nickname
                        });
                    }
                }
            } catch (error) {
                console.error('Error in matching:', error);
                socket.emit('error', { message: 'Error finding match' });
            }
        });

        // Handle joining chat room
        socket.on('join_chat', async ({ chatRoomId }) => {
            socket.join(chatRoomId);
            
            // Load previous messages
            const messages = await Message.find({ chatRoomId })
                .sort({ timestamp: 1 })
                .limit(50);
            
            socket.emit('load_previous_messages', messages);
        });

        // Handle sending messages
        socket.on('send_message', async ({ chatRoomId, senderId, message }) => {
            try {
                // Store in MongoDB
                const newMessage = await Message.create({
                    chatRoomId,
                    senderId,
                    message,
                    timestamp: new Date()
                });

                // Store in Redis for real-time access
                await redisClient.lPush(`chat:${chatRoomId}`, JSON.stringify(newMessage));
                
                // Update last message timestamp
                await ChatRoom.findOneAndUpdate(
                    { chatRoomId },
                    { lastMessage: new Date() }
                );

                // Emit to all users in the room
                io.to(chatRoomId).emit('receive_message', newMessage);
            } catch (error) {
                console.error('Error sending message:', error);
                socket.emit('error', { message: 'Error sending message' });
            }
        });

        // Handle disconnection
        socket.on('disconnect', async () => {
            // Remove from waiting list if they were searching
            const userId = socket.userId;
            if (userId) {
                await matchingService.removeFromWaitingList(userId);
            }
        });
    });
};