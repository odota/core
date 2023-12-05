// Processes a queue of requests to update MMR/rank medal for players
import queue from '../store/queue.mjs';
import db from '../store/db.mjs';
import redis from '../store/redis.mjs';
import { insertPlayerRating, insertPlayerPromise } from '../store/queries.mjs';
import config from '../config.js';
import {
  getDataPromise,
  redisCount,
  getRetrieverArr,
} from '../util/utility.mjs';
const retrieverArr = getRetrieverArr();
async function processMmr(job: MmrJob) {
  const accountId = job.account_id;
  const urls = retrieverArr.map(
    (r) => `http://${r}?key=${config.RETRIEVER_SECRET}&account_id=${accountId}`
  );
  //@ts-ignore
  const data = await getDataPromise({ url: urls });
  redisCount(redis, 'retriever_player');
  // NOTE: This leads to a massive number of updates on the player table
  // Only write it sometimes, unless we're in dev mode
  if (config.NODE_ENV === 'development' || Math.random() < 0.05) {
    const player = {
      account_id: job.account_id || null,
      plus: Boolean(data.is_plus_subscriber),
    };
    await insertPlayerPromise(db, player, false);
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
}
await queue.runQueue(
  'mmrQueue',
  config.MMR_PARALLELISM * retrieverArr.length,
  processMmr
);
