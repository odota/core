/**
 * Interface to Redis client
 * */
const redis = require('redis');
const config = require('../config');

console.log('connecting %s', config.REDIS_URL);
const client = redis.createClient(config.REDIS_URL, {
  detect_buffers: true,
});
client.on('error', (err) => {
  console.error(err);
  process.exit(1);
});
module.exports = client;
