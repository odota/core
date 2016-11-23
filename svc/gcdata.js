/**
 * Worker to fetch GC (Game Coordinator) data for matches
 **/
const getGcData = require('../util/getGcData');
const queue = require('../store/queue');
const db = require('../store/db');
const redis = require('../store/redis');
const utility = require('../util/utility');

const retrieverArr = utility.getRetrieverArr();

function processGcData(job, cb) {
  getGcData(db, redis, job, cb);
}

queue.runQueue('gcQueue', Math.floor(retrieverArr.length * 1.5), processGcData);
