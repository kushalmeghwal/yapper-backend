import Redis from 'ioredis';

// Redis URL from env
const redis = new Redis(process.env.REDIS_URL, {
  tls: {} // Required for Upstash SSL
});

redis.on('connect', () => {
  console.log('✅ Redis connected successfully');
});

redis.on('error', (err) => {
  console.error('❌ Redis connection error:', err);
});

export default redis;

