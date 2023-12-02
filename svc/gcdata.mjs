import getGcData from '../util/getGcData.js';
import queue from '../store/queue.js';
import config from '../config.js';
import utility from '../util/utility.js';
const { getRetrieverArr } = utility;
const retrieverArr = getRetrieverArr();
async function processGcData(job, cb) {
  job.useGcDataArr = true;
  try {
    await getGcData(job);
    cb();
  } catch (e) {
    cb(e);
  }
}
queue.runQueue(
  'gcQueue',
  Number(config.GCDATA_PARALLELISM) * retrieverArr.length,
  processGcData
);
