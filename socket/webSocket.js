import { Server } from 'socket.io';
import matchingService from './matchingService.js';
import { Message, ChatRoom } from '../models/chatModel.js';
import { User } from '../models/userModel.js';
import redisClient from '../config/redis.js';

export default (io) => {
    io.on('connection', (socket) => {
        console.log('✅ User connected:', socket.id);

        // Store userId in socket for later use
        socket.on('join', ({ userId }) => {
            console.log('👤 User joined:', userId);
            socket.userId = userId;
        });

        // Handle search request
        socket.on('start_search', async ({ userId, mood, choice }) => {
            console.log('🔍 Search request from:', userId, 'Mood:', mood, 'Choice:', choice);
            try {
                // Verify user exists and is logged in
                const user = await User.findById(userId);
                if (!user) {
                    console.log('❌ User not found:', userId);
                    socket.emit('error', { message: 'User not found' });
                    return;
                }

                // Add to waiting list and try to find match
                const matchResult = await matchingService.addToWaitingList(userId, mood, choice);
                console.log('🎯 Match result:', matchResult);
                
                if (matchResult.matched) {
                    // Create chat room
                    const chatRoomId = `chat_${userId}_${matchResult.matchedUserId}`;
                    console.log('💬 Creating chat room:', chatRoomId);
                    
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

                    console.log('👥 Matched users:', {
                        user1: user1?.nickname,
                        user2: user2?.nickname
                    });

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
                        console.log('📨 Notifying other user:', matchResult.matchedUserId);
                        otherUserSocket.emit('match_found', {
                            chatRoomId,
                            receiverId: userId,
                            receiverNickname: user1.nickname
                        });
                    } else {
                        console.log('⚠️ Other user socket not found:', matchResult.matchedUserId);
                    }
                } else {
                    console.log('⏳ No match found for:', userId);
                }
            } catch (error) {
                console.error('❌ Error in matching:', error);
                socket.emit('error', { message: 'Error finding match' });
            }
        });

        // Handle joining chat room
        socket.on('join_chat', async ({ chatRoomId }) => {
            console.log('🚪 User joining chat room:', chatRoomId);
            socket.join(chatRoomId);
            
            // Load previous messages
            const messages = await Message.find({ chatRoomId })
                .sort({ timestamp: 1 })
                .limit(50);
            
            console.log('📚 Loaded previous messages:', messages.length);
            socket.emit('load_previous_messages', messages);
        });

        // Handle sending messages
        socket.on('send_message', async ({ chatRoomId, senderId, message }) => {
            console.log('📤 New message in room:', chatRoomId, 'from:', senderId);
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
                console.log('✅ Message sent successfully');
            } catch (error) {
                console.error('❌ Error sending message:', error);
                socket.emit('error', { message: 'Error sending message' });
            }
        });

        // Handle disconnection
        socket.on('disconnect', async () => {
            console.log('👋 User disconnected:', socket.id);
            // Remove from waiting list if they were searching
            const userId = socket.userId;
            if (userId) {
                console.log('🗑️ Removing user from waiting list:', userId);
                await matchingService.removeFromWaitingList(userId);
            }
        });
    });
};