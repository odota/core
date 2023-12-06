import redis from './redis.mts';
import config from '../config.js';
import type { Request, Response } from 'express';

export const getKeys = () => ['wl', 'heroes', 'peers', 'counts'];
export const readCache = (
  input: { key: string; account_id: string },
  cb: StringErrorCb
) => {
  // console.log(`[READCACHE] cache:${req.key}:${req.account_id}`);
  redis.get(`cache:${input.key}:${input.account_id}`, cb);
};
export const clearCache = async (input: {
  key: string;
  account_id: string;
}) => {
  await redis.del(`cache:${input.key}:${input.account_id}`);
};
export const sendDataWithCache = (
  req: Request,
  res: Response,
  data: any,
  key: string
) => {
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
