const redis = require('./redis');
const config = require('../config');

const getKeys = () => ['wl', 'heroes', 'peers'];

module.exports = {
  read: (req, cb) => {
    console.log(`[READCACHE] cache:${req.key}:${req.account_id}`);
    redis.get(`cache:${req.key}:${req.account_id}`, cb);
  },
  update: (req, cb) => {
    redis.del(`cache:${req.key}:${req.account_id}`, cb);
  },
  write: (req, data, cb) => {
    console.log(`[WRITECACHE] cache:${req.key}:${req.account_id}`);
    redis.setex(`cache:${req.key}:${req.account_id}`, config.PLAYER_CACHE_SECONDS, data, cb);
  },
  getKeys,
};
