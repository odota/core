/**
 * Worker to fetch MMR and Dota Plus data for players
 * */
import { runQueue } from '../store/queue.js';
import db from '../store/db.js';
import { insertPlayer, insertPlayerRating } from '../store/queries.js';
import { RETRIEVER_SECRET, MMR_PARALLELISM } from '../config.js';
import { getData, redisCount, getRetrieverArr } from '../util/utility.js';
import redis from '../store/redis.js';

const retrieverArr = getRetrieverArr();

function processMmr(job, cb) {
  // Don't always do the job
  if (Math.random() < 0) {
    return cb();
  }
  const accountId = job.account_id;
  const urls = retrieverArr.map(
    (r) => `http://${r}?key=${RETRIEVER_SECRET}&account_id=${accountId}`
  );
  return getData({ url: urls }, (err, data) => {
    if (err) {
      return cb(err);
    }
    redisCount(redis, 'retriever_player');
    const player = {
      account_id: job.account_id || null,
      plus: Boolean(data.is_plus_subscriber),
    };
    return insertPlayer(db, player, false, () => {
      if (
        data.solo_competitive_rank ||
        data.competitive_rank ||
        data.rank_tier ||
        data.leaderboard_rank
      ) {
        data.account_id = job.account_id || null;
        data.match_id = job.match_id || null;
        data.solo_competitive_rank = data.solo_competitive_rank || null; // 0 MMR is not a valid value
        data.competitive_rank = data.competitive_rank || null;
        data.time = new Date();
        return insertPlayerRating(db, data, cb);
      }
      return cb();
    });
  });
}

runQueue(
  'mmrQueue',
  MMR_PARALLELISM * retrieverArr.length,
  processMmr
);
