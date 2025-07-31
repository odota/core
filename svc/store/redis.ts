import { Redis } from 'ioredis';
import config from '../../config';

let redis: Redis | null = null;
if (config.REDIS_URL) {
  console.log('connecting %s', config.REDIS_URL);
  redis = new Redis(config.REDIS_URL);
}

// This may be null if Redis is not configured
// Cast the type to avoid having to fix all callsites
// Callers that require Redis to function should crash (designed to flag issues)
// Some callers (e.g. counts) can just skip if Redis isn't available
export default redis as Redis;
