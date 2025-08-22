// Processes a queue of requests for gcdata (replay salts) without parsing
// The parser will also request gcdata if needed
import { runQueue } from './store/queue';
import config from '../config';
import { gcFetcher } from './fetcher/getGcData';
import { reconcile } from './util/insert';
import { redisCount } from './util/utility';

async function processGcData(job: GcDataJob) {
  const pgroup = job.pgroup;
  if (!pgroup) {
    return;
  }
  // Currently, just attempt it once and skip if failed
  const { data: gcMatch } = await gcFetcher.getOrFetchData(job.match_id, {
    pgroup,
  });
  if (gcMatch) {
    // Reconcile anonymous players
    await reconcile(gcMatch, pgroup, 'pmh_gcdata');
    await redisCount('gcdata');
  }
  await new Promise((resolve) => setTimeout(resolve, 10));
}

console.log('[GCDATA] starting');
runQueue('gcQueue', Number(config.GCDATA_PARALLELISM) || 1, processGcData);
