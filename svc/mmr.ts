// Processes a queue of requests to update MMR/rank medal for players
import { runQueue } from '../store/queue';
import db from '../store/db';
import redis from '../store/redis';
import { insertPlayerRating } from '../store/insert';
import config from '../config';
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

  // Update player's Dota Plus status if changed
  const player = {
    account_id: job.account_id,
    plus: Boolean(data.is_plus_subscriber),
  };
  await db.raw('UPDATE players SET plus = ? WHERE account_id = ? AND (plus != ? OR plus IS NULL)', [player.plus, player.account_id, player.plus]);

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
  await new Promise((resolve) => setTimeout(resolve, 1));
}
runQueue(
  'mmrQueue',
  Number(config.MMR_PARALLELISM) * getRetrieverCount(),
  processMmr,
);
