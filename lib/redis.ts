import Redis from 'ioredis';

// Vercel Redis (veya herhangi bir Redis) URL'i
const redisUrl = process.env.REDIS_URL || process.env.KV_URL;

if (!redisUrl) {
  throw new Error('Redis connection string (REDIS_URL) is missing!');
}

const redis = new Redis(redisUrl, {
  tls: redisUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
});

export default redis;

