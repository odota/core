/**
 * Worker to fetch GC (Game Coordinator) data for matches
 * */
const getGcData = require('../util/getGcData');
const queue = require('../store/queue');
const config = require('../config');
const utility = require('../util/utility');

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
