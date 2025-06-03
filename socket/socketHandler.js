import { MatchingService } from './matchingService.js';


export class SocketHandler {
    constructor(io) {
        this.io = io;
        this.matchingService = new MatchingService();
        this.activeUsers = new Map(); // userId -> socketId
        this.initializeSocketHandlers();
    }

    initializeSocketHandlers() {
        this.io.on('connection', (socket) => {
            console.log('New client connected:', socket.id);

            // Handle user joining
            socket.on('join', async (userId) => {
                try {
                    console.log(`User ${userId} joined with socket ID ${socket.id}`);
                    this.activeUsers.set(userId, socket.id);
                    console.log('Active users:', Array.from(this.activeUsers.entries()));
                } catch (error) {
                    console.error('Error in join handler:', error);
                }
            });

            // Handle search requests
            socket.on('startSearching', async (data) => {
                try {
                    const { userId, type, mood } = data;
                    if (!userId || !type || !mood) {
                        console.error('Missing required fields in startSearching');
                        return;
                    }
                    console.log(`User ${userId} started searching for ${type} with mood ${mood}`);
                    await this.matchingService.startSearching(userId, type, mood);
                } catch (error) {
                    console.error('Error in startSearching handler:', error);
                }
            });

            socket.on('stopSearching', async (userId) => {
                try {
                    if (!userId) {
                        console.error('Missing userId in stopSearching');
                        return;
                    }
                    console.log(`User ${userId} stopped searching`);
                    await this.matchingService.stopSearching(userId);
                } catch (error) {
                    console.error('Error in stopSearching handler:', error);
                }
            });

            // Handle messages
            socket.on('sendMessage', async (data) => {
                try {
                    const { chatRoomId, senderId, receiverId, message, timestamp } = data;
                    if (!chatRoomId || !senderId || !receiverId || !message) {
                        console.error('Missing required fields in sendMessage');
                        return;
                    }

                    console.log('Received message:', {
                        chatRoomId,
                        senderId,
                        receiverId,
                        message,
                        timestamp
                    });

                    // Save message to database and get the saved message
                    const savedMessage = await this.matchingService.saveMessage(chatRoomId, senderId, receiverId, message, timestamp);
                    console.log('Message saved:', savedMessage);

                    // Get receiver's socket ID
                    const receiverSocketId = this.activeUsers.get(receiverId);
                    const senderSocketId = this.activeUsers.get(senderId);

                    // Always emit to receiver if they have a socket ID
                    if (receiverSocketId) {
                        this.io.to(receiverSocketId).emit('receiveMessage', savedMessage);
                        console.log('Message sent to receiver:', receiverId);
                    } else {
                        console.log('Receiver not online, message will be delivered when they connect');
                    }

                    // Always emit to sender for confirmation
                    if (senderSocketId) {
                        this.io.to(senderSocketId).emit('receiveMessage', savedMessage);
                        console.log('Message confirmation sent to sender:', senderId);
                    }

                } catch (error) {
                    console.error('Error in sendMessage handler:', error);
                    // Notify sender of error
                    const senderSocketId = this.activeUsers.get(data.senderId);
                    if (senderSocketId) {
                        this.io.to(senderSocketId).emit('messageError', {
                            error: 'Failed to send message',
                            details: error.message
                        });
                    }
                }
            });

            // Handle chat history requests
            socket.on('getChatHistory', async (data) => {
                try {
                    const { chatRoomId } = data;
                    if (!chatRoomId) {
                        console.error('Missing chatRoomId in getChatHistory');
                        return;
                    }

                    console.log('Getting chat history for room:', chatRoomId);
                    const messages = await this.matchingService.getChatHistory(chatRoomId);
                    socket.emit('chatHistory', messages);
                    console.log('Chat history sent for room:', chatRoomId);
                } catch (error) {
                    console.error('Error in getChatHistory handler:', error);
                    socket.emit('messageError', {
                        error: 'Failed to get chat history',
                        details: error.message
                    });
                }
            });

            // Handle disconnection
            socket.on('disconnect', () => {
                console.log('Client disconnected:', socket.id);
                // Remove user from active users
                for (const [userId, socketId] of this.activeUsers.entries()) {
                    if (socketId === socket.id) {
                        this.activeUsers.delete(userId);
                        console.log(`User ${userId} removed from active users`);
                        break;
                    }
                }
                console.log('Active users:', Array.from(this.activeUsers.entries()));
            });
        });
    }
}
