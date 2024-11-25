// Processes a queue of auto player cache requests
import { populateTemp } from '../store/queries';
import { runQueue } from '../store/queue';
import { redisCount, redisCountDistinct } from '../util/utility';

async function processCache(job: CacheJob) {
  const accountId = job;
  console.log(accountId);
  redisCountDistinct('distinct_auto_player_cache', accountId);
  redisCount('auto_player_cache');
  // Don't need to await this since it's just caching
  populateTemp(Number(accountId), ['match_id']);
}
runQueue('cacheQueue', 1, processCache);
