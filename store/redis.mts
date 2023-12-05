import { Redis } from "ioredis";
import config from '../config.js';
const { REDIS_URL } = config;
console.log('[REDIS] connecting %s', REDIS_URL);
const client = new Redis(REDIS_URL);
export default client;
