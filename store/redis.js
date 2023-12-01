/**
 * Interface to Redis client
 * */
import { createClient } from 'redis';
import config from '../config.js';

console.log('connecting %s', config.REDIS_URL);
const client = createClient(config.REDIS_URL, {
  detect_buffers: true,
});
client.on('error', (err) => {
  console.error(err);
  process.exit(1);
});
export default client;
