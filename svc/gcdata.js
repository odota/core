/**
 * Worker to fetch GC (Game Coordinator) data for matches
 * */
const getGcData = require('../util/getGcData');
const queue = require('../store/queue');
const config = require('../config');

function processGcData(job, cb) {
  getGcData(job, cb);
}

queue.runQueue('gcQueue', Number(config.GCDATA_PARALLELISM), processGcData);
