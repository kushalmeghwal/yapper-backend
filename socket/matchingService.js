import redisClient from '../config/redis.js';

class MatchingService {
    constructor() {
        this.activeSearches = new Map(); // Store active searches in memory
    }

    async addToWaitingList(userId, mood, choice) {
        console.log('🔍 Adding user to waiting list:', { userId, mood, choice });
        
        // Store search request in Redis with expiration
        const searchKey = `search:${userId}`;
        const searchData = {
            userId,
            mood,
            choice,
            timestamp: Date.now()
        };

        await redisClient.set(searchKey, JSON.stringify(searchData), {
            EX: 300 // Expire after 5 minutes
        });

        // Try to find a match
        return this.findMatch(userId, mood, choice);
    }

    async findMatch(userId, mood, choice) {
        console.log('🎯 Finding match for:', { userId, mood, choice });
        
        const oppositeChoice = choice === 'Rizzler' ? 'Gyatt' : 'Rizzler';
        
        // Get all active searches from Redis
        const searchKeys = await redisClient.keys('search:*');
        
        for (const key of searchKeys) {
            const searchDataStr = await redisClient.get(key);
            if (!searchDataStr) continue;

            const searchData = JSON.parse(searchDataStr);
            
            // Skip if it's the same user
            if (searchData.userId === userId) continue;
            
            // Check if mood matches and choice is opposite
            if (searchData.mood === mood && searchData.choice === oppositeChoice) {
                // Remove both users from waiting list
                await this.removeFromWaitingList(userId);
                await this.removeFromWaitingList(searchData.userId);
                
                console.log('✅ Match found:', {
                    user1: userId,
                    user2: searchData.userId,
                    mood,
                    choices: [choice, searchData.choice]
                });

                return {
                    matched: true,
                    matchedUserId: searchData.userId
                };
            }
        }
        
        console.log('⏳ No match found for:', userId);
        return { matched: false };
    }

    async removeFromWaitingList(userId) {
        console.log('🗑️ Removing user from waiting list:', userId);
        await redisClient.del(`search:${userId}`);
    }

    async cleanupStaleSearches() {
        // This method can be called periodically to clean up stale searches
        const searchKeys = await redisClient.keys('search:*');
        for (const key of searchKeys) {
            const searchDataStr = await redisClient.get(key);
            if (!searchDataStr) continue;

            const searchData = JSON.parse(searchDataStr);
            const searchAge = Date.now() - searchData.timestamp;
            
            // Remove searches older than 5 minutes
            if (searchAge > 300000) {
                await this.removeFromWaitingList(searchData.userId);
            }
        }
    }
}

export default new MatchingService();