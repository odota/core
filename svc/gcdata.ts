// Processes a queue of requests for gcdata (replay salts) without parsing
// The parser will also request gcdata if needed
import { runQueue } from './store/queue.ts';
import config from '../config.ts';
import { gcFetcher } from './fetcher/getGcData.ts';
import { queueReconcile } from './util/insert.ts';
import { redisCount } from './util/utility.ts';

async function processGcData(job: GcDataJob) {
  const pgroup = job.pgroup;
  if (!pgroup) {
    return;
  }
  const { data: gcMatch } = await gcFetcher.getOrFetchDataWithRetry(
    job.match_id,
    {
      pgroup,
    },
    1000,
  );
  if (gcMatch) {
    // Reconcile anonymous players
    await queueReconcile(gcMatch, pgroup, 'pmh_gcdata');
    await redisCount('gcdata');
  }
  await new Promise((resolve) => setTimeout(resolve, 10));
}

console.log('[GCDATA] starting');
runQueue('gcQueue', Number(config.GCDATA_PARALLELISM) || 1, processGcData);
