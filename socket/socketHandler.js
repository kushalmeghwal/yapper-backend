import { MatchingService } from './matchingService.js';

export class SocketHandler {
    constructor(io) {
        this.io = io;
        this.matchingService = new MatchingService(io);
        this.setupSocketHandlers();
    }

    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            console.log('User connected:', socket.id);

            // Join event - when user connects
            socket.on('join', (userId) => {
                socket.userId = userId;
                socket.join(userId);
                console.log(`User ${userId} joined`);
            });

            // Start searching event
            socket.on('startSearching', ({ userId, type, mood }) => {
                console.log(`User ${userId} started searching with type ${type} and mood ${mood}`);
                this.matchingService.startSearching(userId, type, mood, socket.id);
            });

            // Stop searching event
            socket.on('stopSearching', (userId) => {
                console.log(`User ${userId} stopped searching`);
                this.matchingService.stopSearching(userId);
            });

            // Send message event
            socket.on('sendMessage', async ({ chatRoomId, senderId, receiverId, message }) => {
                console.log(`Message from ${senderId} to ${receiverId}: ${message}`);
                
                // Save message to database
                await this.matchingService.saveMessage(chatRoomId, senderId, receiverId, message);
                
                // Emit message to receiver
                this.io.to(receiverId).emit('receiveMessage', {
                    chatRoomId,
                    senderId,
                    message,
                    timestamp: new Date()
                });
            });

            // Get chat history event
            socket.on('getChatHistory', async ({ chatRoomId }) => {
                const messages = await this.matchingService.getChatHistory(chatRoomId);
                socket.emit('chatHistory', messages);
            });

            // Disconnect event
            socket.on('disconnect', () => {
                if (socket.userId) {
                    this.matchingService.stopSearching(socket.userId);
                    console.log(`User ${socket.userId} disconnected`);
                }
            });
        });
    }
}
