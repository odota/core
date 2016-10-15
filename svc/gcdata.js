/**
 * Worker to fetch GC (Game Coordinator) data for matches
 **/
const getGcData = require('../util/getGcData');
const queue = require('../store/queue');
const db = require('../store/db');
const redis = require('../store/redis');
queue.runQueue('gcQueue', 20, processGcData);

function processGcData(job, cb) {
  getGcData(db, redis, job, cb);
}