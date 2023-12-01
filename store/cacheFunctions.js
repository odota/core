const redis = require('./redis');
const config = require('../config');

const write = (req, data, cb) => {
  // console.log(`[WRITECACHE] cache:${req.key}:${req.account_id}`);
  redis.setex(
    `cache:${req.key}:${req.account_id}`,
    config.PLAYER_CACHE_SECONDS,
    data,
    cb
  );
};
const getKeys = () => ['wl', 'heroes', 'peers', 'counts'];

module.exports = {
  read: (req, cb) => {
    // console.log(`[READCACHE] cache:${req.key}:${req.account_id}`);
    redis.get(`cache:${req.key}:${req.account_id}`, cb);
  },
  update: (req, cb) => {
    redis.del(`cache:${req.key}:${req.account_id}`, cb);
  },
  write,
  sendDataWithCache: (req, res, data, key) => {
    if (
      config.ENABLE_PLAYER_CACHE &&
      req.originalQuery &&
      !Object.keys(req.originalQuery).length
    ) {
      write(
        {
          key,
          account_id: req.params.account_id,
        },
        JSON.stringify(data),
        () => {}
      );
    }
    return res.json(data);
  },
  getKeys,
};
