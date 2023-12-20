// Processes a queue of requests for gcdata (replay salts) without parsing
// The parser will also request gcdata if needed
import { getGcData } from '../store/getGcData';
import queue from '../store/queue';
import config from '../config.js';
import { getRetrieverCount } from '../util/utility';

async function processGcData(job: GcDataJob) {
  // We don't need the result, but we do want to respect the DISABLE_REGCDATA setting
  await getGcData(job);
}

console.log('[GCDATA] starting');
queue.runQueue(
  'gcQueue',
  Number(config.GCDATA_PARALLELISM) * getRetrieverCount(),
  processGcData,
);
