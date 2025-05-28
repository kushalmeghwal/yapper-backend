import redisClient from '../config/redis.js';

class MatchingService {
    constructor() {
        this.waitingUsers = new Map(); // In-memory map for quick access
    }

    async addToWaitingList(userId, mood, choice) {
        const userKey = `waiting:${userId}`;
        const userData = {
            userId,
            mood,
            choice,
            timestamp: Date.now()
        };

        // Store in Redis
        await redisClient.hSet('waiting_users', userId, JSON.stringify(userData));
        this.waitingUsers.set(userId, userData);

        // Try to find a match
        return this.findMatch(userId, mood, choice);
    }

    async findMatch(userId, mood, choice) {
        const oppositeChoice = choice === 'Rizzler' ? 'Gyatt' : 'Rizzler';
        
        // Get all waiting users from Redis
        const waitingUsers = await redisClient.hGetAll('waiting_users');
        
        for (const [waitingUserId, userDataStr] of Object.entries(waitingUsers)) {
            const userData = JSON.parse(userDataStr);
            
            // Skip if it's the same user
            if (waitingUserId === userId) continue;
            
            // Check if mood matches and choice is opposite
            if (userData.mood === mood && userData.choice === oppositeChoice) {
                // Remove both users from waiting list
                await this.removeFromWaitingList(userId);
                await this.removeFromWaitingList(waitingUserId);
                
                return {
                    matched: true,
                    matchedUserId: waitingUserId
                };
            }
        }
        
        return { matched: false };
    }

    async removeFromWaitingList(userId) {
        await redisClient.hDel('waiting_users', userId);
        this.waitingUsers.delete(userId);
    }
}

export default new MatchingService();