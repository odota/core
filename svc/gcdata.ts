import { config } from "../config.ts";
import { apiFetcher, gcFetcher } from "./fetcher/allFetchers.ts";
import { runReliableQueue } from "./store/queue.ts";
import { queueReconcile } from "./util/insert.ts";
import { getPGroup } from "./util/pgroup.ts";

await runReliableQueue(
  "gcdata",
  Number(config.GCDATA_PARALLELISM),
  async function gcdata(job: GcDataJob) {
    const matchId = job.match_id;
    let apiMatch = await apiFetcher.getData(
      matchId,
    );
    if (!apiMatch) {
        throw new Error('missing API data: ' + matchId);
    }
    const pgroup = getPGroup(apiMatch);
    const { data: gcMatch } = await gcFetcher.getOrFetchDataWithRetry(
      matchId,
      {
        pgroup,
        origin: job.origin,
      },
      250,
    );
    if (job.reconcile) {
      await queueReconcile(gcMatch, pgroup, "pmh_gcdata");
    }
    return true;
  },
);
