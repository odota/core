// Processes a queue of auto player cache requests
import { populateTemp } from './util/buildPlayer.ts';
import { runReliableQueue } from './store/queue.ts';
import { redisCount, redisCountDistinct } from './store/redis.ts';

runReliableQueue('cacheQueue', 1, async function cache(job: CacheJob) {
  const accountId = job.account_id;
  redisCountDistinct('distinct_auto_player_temp', String(accountId));
  redisCount('auto_player_temp');
  await populateTemp(accountId, ['match_id']);
  return true;
});
