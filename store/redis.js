/**
 * Interface to Redis client
 * */
const Redis = require('ioredis');
const { REDIS_URL } = require('../config');

console.log('[REDIS] connecting %s', REDIS_URL);
const client = new Redis(REDIS_URL);

module.exports = client;
