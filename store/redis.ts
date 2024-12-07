import { Redis } from 'ioredis';
import config from '../config';
const { REDIS_URL } = config;
console.log('connecting %s', REDIS_URL);
export const redis = new Redis(REDIS_URL);
export default redis;
