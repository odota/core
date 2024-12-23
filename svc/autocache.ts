// Processes a queue of auto player cache requests
import { populateTemp } from '../util/buildPlayer';
import { runQueue } from '../store/queue';
import { redisCount, redisCountDistinct } from '../util/utility';

async function processCache(job: CacheJob) {
  const accountId = job;
  console.time(accountId);
  redisCountDistinct('distinct_auto_player_temp', accountId);
  redisCount('auto_player_temp');
  await populateTemp(Number(accountId), ['match_id']);
  console.timeEnd(accountId);
}
runQueue('cacheQueue', 10, processCache);
