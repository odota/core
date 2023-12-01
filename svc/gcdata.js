/**
 * Worker to fetch GC (Game Coordinator) data for matches
 * */
import getGcData from '../util/getGcData.js';
import { runQueue } from '../store/queue.js';
import { GCDATA_PARALLELISM } from '../config.js';
import utility from '../util/utility.js';

const { getRetrieverArr } = utility;
const retrieverArr = getRetrieverArr();

function processGcData(job, cb) {
  job.useGcDataArr = true;
  getGcData(job, cb);
}

runQueue(
  'gcQueue',
  Number(GCDATA_PARALLELISM) * retrieverArr.length,
  processGcData
);
