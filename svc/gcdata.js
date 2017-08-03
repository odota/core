/**
 * Worker to fetch GC (Game Coordinator) data for matches
 **/
const getGcData = require('../util/getGcData');
const queue = require('../store/queue');
// const utility = require('../util/utility');

// const retrieverArr = utility.getRetrieverArr();

function processGcData(job, cb) {
  getGcData(job, cb);
}

queue.runQueue('gcQueue', 40, processGcData);
