import redis from './redis.mjs';
import config from '../config.js';

export const getKeys = () => ['wl', 'heroes', 'peers', 'counts'];
export const readCache = (input, cb) => {
  // console.log(`[READCACHE] cache:${req.key}:${req.account_id}`);
  redis.get(`cache:${input.key}:${input.account_id}`, cb);
};
export const clearCache = async (input) => {
  await redis.del(`cache:${input.key}:${input.account_id}`);
};
export const sendDataWithCache = (req, res, data, key) => {
  if (
    config.ENABLE_PLAYER_CACHE &&
    req.originalQuery &&
    !Object.keys(req.originalQuery).length
  ) {
    redis.setex(
      `cache:${key}:${req.params.account_id}`,
      config.PLAYER_CACHE_SECONDS,
      JSON.stringify(data)
    );
  }
  return res.json(data);
};
