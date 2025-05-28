import { Server } from 'socket.io';
import matchingService from './matchingService.js';
import chatService from './chatService.js';

class SocketHandler {
    constructor(server) {
        this.io = new Server(server, {
            cors: {
                origin: process.env.FRONTEND_URL || 'http://localhost:3000',
                methods: ['GET', 'POST']
            }
        });
        
        this.activeConnections = new Map();
        this.setupSocketHandlers();
    }

    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            console.log('🔌 New connection:', socket.id);

            // Handle user authentication
            socket.on('authenticate', async (userId) => {
                console.log('🔑 Authenticating user:', userId);
                this.activeConnections.set(userId, socket.id);
                socket.userId = userId;
                socket.join(userId);
            });

            // Handle search request
            socket.on('search', async ({ mood, choice }) => {
                if (!socket.userId) {
                    socket.emit('error', { message: 'Not authenticated' });
                    return;
                }

                console.log('🔍 Search request:', { userId: socket.userId, mood, choice });
                
                try {
                    const result = await matchingService.addToWaitingList(socket.userId, mood, choice);
                    
                    if (result.matched) {
                        const matchedSocketId = this.activeConnections.get(result.matchedUserId);
                        if (matchedSocketId) {
                            // Create a unique room ID for the chat
                            const roomId = [socket.userId, result.matchedUserId].sort().join('-');
                            
                            // Join both users to the room
                            socket.join(roomId);
                            this.io.sockets.sockets.get(matchedSocketId)?.join(roomId);
                            
                            // Notify both users
                            this.io.to(roomId).emit('match_found', { roomId });
                            
                            console.log('✅ Match created:', {
                                roomId,
                                users: [socket.userId, result.matchedUserId]
                            });
                        }
                    } else {
                        socket.emit('searching');
                    }
                } catch (error) {
                    console.error('❌ Search error:', error);
                    socket.emit('error', { message: 'Failed to process search request' });
                }
            });

            // Handle chat messages
            socket.on('send_message', async ({ roomId, message }) => {
                if (!socket.userId) {
                    socket.emit('error', { message: 'Not authenticated' });
                    return;
                }

                try {
                    const savedMessage = await chatService.saveMessage(roomId, socket.userId, message);
                    this.io.to(roomId).emit('new_message', savedMessage);
                } catch (error) {
                    console.error('❌ Message error:', error);
                    socket.emit('error', { message: 'Failed to send message' });
                }
            });

            // Handle disconnection
            socket.on('disconnect', () => {
                if (socket.userId) {
                    console.log('👋 User disconnected:', socket.userId);
                    this.activeConnections.delete(socket.userId);
                    matchingService.removeFromWaitingList(socket.userId);
                }
            });
        });
    }
}

export default SocketHandler; 