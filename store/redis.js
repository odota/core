/**
 * Interface to Redis client
 **/
const config = require('../config');
const redis = require('redis');
console.error('connecting %s', config.REDIS_URL);
const client = redis.createClient(config.REDIS_URL, {
  detect_buffers: true,
});
client.on('error', (err) => {
  console.error(err);
  process.exit(1);
});
module.exports = client;
