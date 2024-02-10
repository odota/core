// Processes a queue of auto player cache requests
import { populateCache } from '../store/queries';
import { runQueue } from '../store/queue';
import redis from '../store/redis';
import { redisCount, redisCountDistinct } from '../util/utility';

async function processCache(job: CacheJob) {
    const accountId = job;
    redisCountDistinct(
        redis,
        'distinct_auto_player_cache',
        accountId,
    );
    redisCount(redis, 'auto_player_cache');
    // Don't need to await this since it's just caching
    populateCache(Number(accountId), ['match_id']);
}
runQueue(
  'cacheQueue',
  1,
  processCache,
);
