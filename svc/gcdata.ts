// Processes a queue of requests for gcdata (replay salts) without parsing
// The parser will also request gcdata if needed
import { runQueue } from './store/queue';
import config from '../config';
import { apiFetcher } from './fetcher/getApiData';
import { gcFetcher } from './fetcher/getGcData';
import { getPGroup } from './util/pgroup';
import { redisCount } from './util/utility';

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
  const gcResult = await gcFetcher.getOrFetchData(job.match_id, { pgroup });
  const gcMatch = gcResult.data;
  if (gcMatch) {
    // Reconcile anonymous players
    // We don't need to do this twice if the match is going to be parsed
    await Promise.all(
      gcMatch.players
        .filter((p) => !Boolean(pgroup[p.player_slot]?.account_id))
        .map(async (p) => {
          // await db.raw('INSERT INTO player_match_history(account_id, match_id, player_slot) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', [p.account_id, gcMatch.match_id, p.player_slot]);
          await redisCount('pmh_gcdata');
        }),
    );
  }

  await new Promise((resolve) => setTimeout(resolve, 1));
}

console.log('[GCDATA] starting');
runQueue('gcQueue', Number(config.GCDATA_PARALLELISM), processGcData);
