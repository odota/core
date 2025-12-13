// Processes a queue of requests for gcdata (replay salts) without parsing
// The parser will also request gcdata if needed
import { runReliableQueue } from "./store/queue.ts";
import config from "../config.ts";
import { gcFetcher } from "./fetcher/allFetchers.ts";
import { redisCount } from "./store/redis.ts";
import { getRetrieverCapacity } from "./util/registry.ts";

runReliableQueue(
  "gcQueue",
  Number(config.GCDATA_PARALLELISM) || 1,
  processGcData,
  getRetrieverCapacity,
);

async function processGcData(job: GcDataJob) {
  const pgroup = job.pgroup;
  if (!pgroup) {
    return true;
  }
  const { data: gcMatch } = await gcFetcher.getOrFetchDataWithRetry(
    job.match_id,
    {
      pgroup,
    },
    250,
  );
  if (gcMatch) {
    redisCount("gcdata");
  }
  // await new Promise((resolve) => setTimeout(resolve, 0));
  return true;
}
