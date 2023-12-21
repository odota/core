// Processes a queue of requests to update MMR/rank medal for players
import queue from '../store/queue';
import db from '../store/db';
import redis from '../store/redis';
import { insertPlayerRating, upsertPlayer } from '../store/insert';
import config from '../config.js';
import {
  getRetrieverCount,
  redisCount,
  getRandomRetrieverUrl,
} from '../util/utility';
import axios from 'axios';

async function processMmr(job: MmrJob) {
  const accountId = job.account_id;
  const url = getRandomRetrieverUrl({ accountId });
  console.log(url);
  const { data } = await axios.get(url);
  redisCount(redis, 'retriever_player');
  // NOTE: To reduce the number of updates on the player table
  // Only write it sometimes, unless we're in dev mode
  if (config.NODE_ENV === 'development' || Math.random() < 0.05) {
    const player = {
      account_id: job.account_id,
      plus: Boolean(data.is_plus_subscriber),
    };
    await upsertPlayer(db, player, false);
  }
  if (
    data.solo_competitive_rank ||
    data.competitive_rank ||
    data.rank_tier ||
    data.leaderboard_rank
  ) {
    data.account_id = job.account_id || null;
    data.match_id = job.match_id || null;
    data.time = new Date();
    await insertPlayerRating(data);
  }
  await new Promise(resolve => setTimeout(resolve, 100));
}
queue.runQueue(
  'mmrQueue',
  config.MMR_PARALLELISM * getRetrieverCount(),
  processMmr,
);
