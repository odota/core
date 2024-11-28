// Processes a queue of auto player cache requests
import { populateTemp } from '../store/queries';
import { runQueue } from '../store/queue';
import { redisCount, redisCountDistinct } from '../util/utility';
import cassandra from '../store/cassandra';

async function processCache(job: CacheJob) {
  const accountId = job;
  // Filter on some criteria to determine if we should cache?
  // e.g. cache already exists (player was visited recently), logged in opendota user, min number of matches played?
  const existsCheck = await cassandra.execute('SELECT account_id from player_temp WHERE account_id = ?', [accountId], { prepare: true, fetchSize: 1 });
  if (!existsCheck.rows.length) {
    return;
  }
  console.time(accountId);
  redisCountDistinct('distinct_auto_player_cache', accountId);
  redisCount('auto_player_cache');
  await populateTemp(Number(accountId), ['match_id']);
  console.timeEnd(accountId);
}
runQueue('cacheQueue', 10, processCache);
