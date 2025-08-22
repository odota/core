// Processes a queue of requests for gcdata (replay salts) without parsing
// The parser will also request gcdata if needed
import { runQueue } from './store/queue';
import config from '../config';
import { apiFetcher } from './fetcher/getApiData';
import { gcFetcher } from './fetcher/getGcData';
import { getPGroup } from './util/pgroup';
import { reconcile } from './util/insert';

async function processGcData(job: GcDataJob) {
  const matchId = job.match_id;
  // Note: If we want to enable fetching this for more matches, we can probably store the pgroup in the job to avoid having to fetch the api data blob
  const { data } = await apiFetcher.getOrFetchData(matchId);
  if (!data) {
    return;
  }
  const pgroup = getPGroup(data);
  if (!pgroup) {
    return;
  }
  // Currently, just attempt it once and skip if failed
  const { data: gcMatch } = await gcFetcher.getOrFetchData(job.match_id, { pgroup });
  // Reconcile anonymous players
  await reconcile(gcMatch, pgroup, 'pmh_gcdata');
  await new Promise((resolve) => setTimeout(resolve, 1));
}

console.log('[GCDATA] starting');
runQueue('gcQueue', Number(config.GCDATA_PARALLELISM) || 1, processGcData);
