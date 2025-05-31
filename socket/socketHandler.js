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

            // Set up ping timeout
            let pingTimeout;
            const heartbeat = () => {
                clearTimeout(pingTimeout);
                pingTimeout = setTimeout(() => {
                    console.log(`User ${socket.id} timed out after 60 seconds of inactivity`);
                    socket.disconnect(true);
                }, 60000); // 60 seconds timeout
            };

            // Initial heartbeat
            heartbeat();

            // Handle ping from client
            socket.on('ping', () => {
                heartbeat();
                socket.emit('pong');
            });

            // Join event - when user connects
            socket.on('join', (userId) => {
                socket.userId = userId;
                socket.join(userId);
                console.log(`User ${userId} joined with socket ID ${socket.id}`);
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
            socket.on('sendMessage', async ({ chatRoomId, senderId, receiverId, message }) => {
                if (!chatRoomId || !senderId || !receiverId || !message) {
                    console.error('Invalid message data:', { chatRoomId, senderId, receiverId, message });
                    return;
                }
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
                    this.matchingService.stopSearching(socket.userId);
                }
                clearTimeout(pingTimeout);
            });
        });
    }
}
