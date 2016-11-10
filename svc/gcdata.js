/**
 * Worker to fetch GC (Game Coordinator) data for matches
 **/
const getGcData = require('../util/getGcData');
const queue = require('../store/queue');
const db = require('../store/db');
const redis = require('../store/redis');
const config = require('../config');

function processGcData(job, cb) {
  getGcData(db, redis, job, cb);
}

redis.zcard('registeredRetrievers', (err, result) => {
  if (err) {
    return cb(err);
  }
  queue.runQueue('gcQueue', Number(result), processGcData);
});
