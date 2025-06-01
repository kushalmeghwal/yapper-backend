import Redis from 'ioredis';
console.log("✅ Server code started");
const redis = new Redis(process.env.REDIS_URL, {
  tls: true, // Required for Redis Cloud like Upstash (SSL enforced)
});
console.log("🔥 Attempting Redis connection");
redis.on('connect', () => {
  console.log('✅ Connected to Redis');
});

redis.on('error', (err) => {
  console.error('❌ Redis connection error:', err);
});

export default redis;