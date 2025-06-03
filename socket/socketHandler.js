import { MatchingService } from './matchingService.js';
import { User } from '../models/userModel.js';

export class SocketHandler {
    constructor(io) {
        this.io = io;
        this.matchingService = new MatchingService(io);
        this.activeUsers = new Map(); // userId -> socketId
        this.messageDeliveryStatus = new Map();
        this.setupSocketHandlers();
    }

    setupSocketHandlers() {
        console.log("setupSocketHandlers CALLED"); 
        this.io.on('connection', (socket) => {
            console.log('User connected:', socket.id);

            // Join event - when user connects
            socket.on('join', (userId) => {
                socket.userId = userId;
                socket.join(userId);
                this.activeUsers.set(userId, socket.id);
                console.log(`User ${userId} joined with socket ID ${socket.id}`);
                console.log('Active users:', Array.from(this.activeUsers.entries()));
            });

            // Heartbeat handling
            socket.on('ping', () => {
                socket.emit('pong');
            });

            // Start searching event
            socket.on('startSearching', ({ userId, type, mood }) => {
                console.log(`Search request from user ${userId}:`, { type, mood });
                if (!userId || !type || !mood) {
                    console.error('Invalid search request:', { userId, type, mood });
                    return;
                }
                this.matchingService.startSearching(userId, type, mood, socket.id);
            });

            // Stop searching event
            socket.on('stopSearching', (userId) => {
                if (!userId) {
                    console.error('Invalid stop search request: userId is missing');
                    return;
                }
                this.matchingService.stopSearching(userId);
            });

            // Send message event
            socket.on('sendMessage', async ({ chatRoomId, senderId, receiverId, message, timestamp }) => {
                if (!chatRoomId || !senderId || !receiverId || !message || !timestamp) {
                    console.error('Invalid message data:', { chatRoomId, senderId, receiverId, message, timestamp });
                    return;
                }
                console.log(`Message from ${senderId} to ${receiverId}: ${message}`);
                
                try {
                    // Generate unique message ID
                    const messageId = `${chatRoomId}_${senderId}_${timestamp}`;
                    
                    // Check if message was already processed
                    if (this.messageDeliveryStatus.has(messageId)) {
                        console.log('Duplicate message detected, ignoring:', messageId);
                        return;
                    }

                    // Mark message as processed
                    this.messageDeliveryStatus.set(messageId, true);
                    
                    // Clean up old message statuses (keep last 1000)
                    if (this.messageDeliveryStatus.size > 1000) {
                        const keysToDelete = Array.from(this.messageDeliveryStatus.keys()).slice(0, this.messageDeliveryStatus.size - 1000);
                        keysToDelete.forEach(key => this.messageDeliveryStatus.delete(key));
                    }

                    // Save message to database and get the saved message
                    const savedMessage = await this.matchingService.saveMessage(chatRoomId, senderId, receiverId, message, timestamp);
                    console.log('Message saved:', savedMessage);

                    // Get receiver's socket ID
                    const receiverSocketId = this.activeUsers.get(receiverId);
                    const senderSocketId = this.activeUsers.get(senderId);

                    // Emit to receiver if online
                    if (receiverSocketId) {
                        this.io.to(receiverSocketId).emit('receiveMessage', savedMessage);
                        console.log('Message sent to receiver:', receiverId);
                    }

                    // Emit to sender for confirmation
                    if (senderSocketId) {
                        this.io.to(senderSocketId).emit('receiveMessage', savedMessage);
                        console.log('Message confirmation sent to sender:', senderId);
                    }
                } catch (error) {
                    console.error('Error handling message:', error);
                    socket.emit('messageError', { message: 'Failed to send message' });
                }
            });

            // Get chat history event
            socket.on('getChatHistory', async ({ chatRoomId }) => {
                if (!chatRoomId) {
                    console.error('Invalid chat history request: chatRoomId is missing');
                    return;
                }
                const messages = await this.matchingService.getChatHistory(chatRoomId);
                socket.emit('chatHistory', messages);
            });

            // Disconnect event
            socket.on('disconnect', (reason) => {
                if (socket.userId) {
                    console.log(`User ${socket.userId} disconnected. Reason: ${reason}`);
                    // Remove from active users
                    this.activeUsers.delete(socket.userId);
                    console.log('Updated active users:', Array.from(this.activeUsers.entries()));
                    // Only stop searching, don't remove from active users
                    this.matchingService.stopSearching(socket.userId);
                }
            });
        });
    }
}
