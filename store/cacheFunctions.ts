import redis from './redis';
import config from '../config.js';
import type { Response } from 'express';

export const getKeys = () => ['wl', 'heroes', 'peers', 'counts'];
export const readCache = async (input: { key: string; account_id: string }) => {
  // console.log(`[READCACHE] cache:${req.key}:${req.account_id}`);
  return await redis.get(`cache:${input.key}:${input.account_id}`);
};
export const clearCache = async (input: {
  key: string;
  account_id: string;
}) => {
  await redis.del(`cache:${input.key}:${input.account_id}`);
};
export const sendDataWithCache = (
  req: Express.ExtRequest,
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
