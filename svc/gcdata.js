/**
 * Worker to fetch GC (Game Coordinator) data for matches
 **/
const getGcData = require('../util/getGcData');
const queue = require('../store/queue');
const db = require('../store/db');
const redis = require('../store/redis');
const config = require('../config');

const retrieverArr = config.RETRIEVER_HOST.split(',');

function processGcData(job, cb) {
  getGcData(db, redis, job, cb);
}

queue.runQueue('gcQueue', retrieverArr.length, processGcData);
