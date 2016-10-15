/**
 * Worker to fetch GC (Game Coordinator) data for matches
 **/
const getGcData = require('../util/getGcData');
const queue = require('../store/queue');
const db = require('../store/db');
const redis = require('../store/redis');
const gcQueue = queue.getQueue('gcdata');
gcQueue.process(20, processGcData);
gcQueue.on('completed', (job) => {
  job.remove();
});
gcQueue.on('failed', (job) => {
  job.remove();
});

function processGcData(job, cb) {
  getGcData(db, redis, job.data.payload, cb);
}