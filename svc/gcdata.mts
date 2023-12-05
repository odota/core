// Processes a queue of requests for gcdata (replay salts) without parsing
// The parser will also request gcdata if needed
import getGcData from '../store/getGcData.mjs';
import queue from '../store/queue.mjs';
import config from '../config.js';
import utility from '../util/utility.mjs';

const { getRetrieverArr } = utility;
const retrieverArr = getRetrieverArr();

async function processGcData(job: any) {
  job.useGcDataArr = true;
  await getGcData(job);
}

console.log('[GCDATA] starting');
await queue.runQueue(
  'gcQueue',
  Number(config.GCDATA_PARALLELISM) * retrieverArr.length,
  processGcData
);
