import redis from './redis.mjs';
import config from '../config.js';
export const write = (req, data, cb) => {
  // console.log(`[WRITECACHE] cache:${req.key}:${req.account_id}`);
  redis.setex(
    `cache:${req.key}:${req.account_id}`,
    config.PLAYER_CACHE_SECONDS,
    data,
    cb
  );
};
export const getKeys = () => ['wl', 'heroes', 'peers', 'counts'];
export const read = (req, cb) => {
  // console.log(`[READCACHE] cache:${req.key}:${req.account_id}`);
  redis.get(`cache:${req.key}:${req.account_id}`, cb);
};
export const update = async (req) => {
  await redis.del(`cache:${req.key}:${req.account_id}`);
};
export const sendDataWithCache = (req, res, data, key) => {
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
};
export default {
  read,
  update,
  write,
  sendDataWithCache,
  getKeys,
};
