// Updates Steam profile data for players periodically
import db from './store/db';
import { invokeIntervalAsync, randomInt } from './util/utility';
import { addJob } from './store/queue';
import { getPGroup } from './util/pgroup';
import { apiFetcher } from './fetcher/getApiData';

async function doGcData() {
  // We don't have a full listing of valid match IDs
  // Randomly guess IDs (about 1/2 will be valid) and try to do gcdata on them
  // If the API data is missing we'll skip
  // Otherwise we'll fetch gcdata (or skip if already present)
  const max =
    (await db.raw('select max(match_id) from public_matches'))?.rows?.[0]
      ?.max ?? 0;
  const rand = randomInt(0, max);
  if (rand) {
    const { data } = await apiFetcher.getOrFetchData(rand);
    if (data) {
      console.log(rand);
      await addJob({
        name: 'gcQueue',
        data: { match_id: rand, pgroup: getPGroup(data) },
      });
    }
  }
}
invokeIntervalAsync(doGcData, 10000);
