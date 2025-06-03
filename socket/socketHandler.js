import { MatchingService } from './matchingService.js';

export class SocketHandler {
    constructor(io) {
        this.io = io;
        this.matchingService = new MatchingService(io);
        this.activeUsers = new Map(); // userId -> socketId
        this.messageDeliveryStatus = new Map(); // Track message delivery status
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
                // Set user as online in matching service
                this.matchingService.setUserOnline(userId, socket.id);
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

                    // Save message and handle delivery
                    const savedMessage = await this.matchingService.saveMessage(chatRoomId, senderId, receiverId, message, timestamp);
                    console.log('Message saved:', savedMessage);
                    
                    // Get socket IDs using matching service
                    const senderSocketId = this.matchingService.getUserSocketId(senderId);
                    const receiverSocketId = this.matchingService.getUserSocketId(receiverId);

                    // Send confirmation to sender
                    if (senderSocketId) {
                        this.io.to(senderSocketId).emit('receiveMessage', savedMessage);
                        console.log('Message confirmation sent to sender:', senderId);
                    }

                    // Send message to receiver if online
                    if (receiverSocketId) {
                        this.io.to(receiverSocketId).emit('receiveMessage', savedMessage);
                        console.log('Message delivered to receiver:', receiverId);
                    } else {
                        console.log(`Receiver ${receiverId} is offline, message will be available when they come online`);
                    }
                    
                    console.log('Message handling completed');
                } catch (error) {
                    console.error('Error handling message:', error);
                    // Notify sender about the error
                    socket.emit('messageError', { error: 'Failed to send message' });
                }
            });

            // Get chat history event
            socket.on('getChatHistory', async ({ chatRoomId }) => {
                if (!chatRoomId) {
                    console.error('Invalid chat history request: chatRoomId is missing');
                    return;
                }
                try {
                    const messages = await this.matchingService.getChatHistory(chatRoomId);
                    console.log('Sending chat history:', messages);
                    socket.emit('chatHistory', messages);
                } catch (error) {
                    console.error('Error getting chat history:', error);
                    socket.emit('error', { message: 'Failed to get chat history' });
                }
            });

            // Disconnect event
            socket.on('disconnect', (reason) => {
                if (socket.userId) {
                    console.log(`User ${socket.userId} disconnected. Reason: ${reason}`);
                    // Remove from active users
                    this.activeUsers.delete(socket.userId);
                    // Set user as offline in matching service
                    this.matchingService.setUserOffline(socket.userId);
                    console.log('Updated active users:', Array.from(this.activeUsers.entries()));
                    // Only stop searching, don't remove from active users
                    this.matchingService.stopSearching(socket.userId);
                }
            });
        });
    }
}
