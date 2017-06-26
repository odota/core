/**
 * Provides methods for working with the job queue
 **/
const config = require('../config');
const bull = require('bull');
const url = require('url');
const async = require('async');
const redis = require('./redis');

const types = ['parse'];
// parse the url
const connInfo = url.parse(config.REDIS_URL, true /* parse query string */);
if (connInfo.protocol !== 'redis:') {
  throw new Error('connection string must use the redis: protocol');
}
const redisOptions = {
  port: connInfo.port || 6379,
  host: connInfo.hostname,
  DB: connInfo.path ? connInfo.path.substring(1) : 0,
};

function getQueue(type) {
  return bull(type, {
    redis: redisOptions,
  });
}

function getCounts(redis, cb) {
  async.map(types,
  (type, cb) => getQueue(type).getJobCounts().then(result => cb(null, result)).catch(cb),
  (err, result) => {
    const obj = {};
    result.forEach((res, i) => {
      obj[types[i]] = res;
    });
    cb(err, obj);
  });
}

function cleanup(redis, cb) {
  async.each(types, (key, cb) => {
    const queue = getQueue(key);
    async.each(['active', 'completed', 'failed', 'delayed'], (type, cb) => {
      queue.clean(24 * 60 * 60 * 1000, type);
      queue.once('cleaned', (job, type) => {
        console.log('cleaned %s %s jobs from queue %s', job.length, type, key);
        cb();
      });
    }, cb);
  }, cb);
}

function runQueue(queueName, parallelism, processor) {
  const processingQueueName = `${queueName}:active`;
  function processOneJob() {
    redis.blpop(queueName, processingQueueName, '0', (err, job) => {
      if (err) {
        console.error(err);
      }
      // const jobData = JSON.parse(job);
      const jobData = JSON.parse(job[1]);
      processor(jobData, (err) => {
        if (err) {
          console.error(err);
        }
        /*
        if (jobData && jobData.id) {
          // Lock the job so we don't requeue it
          redis.setex(lockKeyName(jobData), 300, 1);
        }
        redis.lrem(processingQueueName, 0, job);
        */
        processOneJob();
      });
    });
  }
  // const lockKeyName = (job) => `${queueName}:lock:${job.id}`;
  for (let i = 0; i < parallelism; i += 1) {
    processOneJob();
  }
  /*
  handleStalledJobs();

  function handleStalledJobs() {
    redis.brpoplpush(processingQueueName, processingQueueName, '0', (err, job) => {
      if (err) {
        console.error(err);
      }
      const jobData = JSON.parse(job);
      if (jobData && jobData.id) {
        // If a job isn't locked and has an ID, return it to queue
        redis.get(lockKeyName(jobData), (err, result) => {
          if (err) {
            console.error(err);
          }
          if (!result) {
            redis.lpush(queueName, job);
          }
          exit();
        });
      } else {
        exit();
      }

      function exit() {
        redis.lrem(processingQueueName, 0, job);
        setTimeout(handleStalledJobs, 10000);
      }
    });
  }
  */
}

module.exports = {
  getQueue,
  getCounts,
  cleanup,
  runQueue,
};
