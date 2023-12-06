// Processes a queue of requests for gcdata (replay salts) without parsing
// The parser will also request gcdata if needed
import getGcData from '../store/getGcData.mts';
import queue from '../store/queue.mts';
import config from '../config.js';
import { getRetrieverArr } from '../util/utility.mts';

const retrieverArr = getRetrieverArr();

async function processGcData(job: GcDataJob) {
  job.useGcDataArr = true;
  await getGcData(job);
}

console.log('[GCDATA] starting');
queue.runQueue(
  'gcQueue',
  Number(config.GCDATA_PARALLELISM) * retrieverArr.length,
  processGcData
);
