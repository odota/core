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
const connInfo = url.parse(config.REDIS_URL, true /* parse query string */ );
if (connInfo.protocol !== 'redis:') {
  throw new Error('connection string must use the redis: protocol');
}
const redisOptions = {
  port: connInfo.port || 6379,
  host: connInfo.hostname,
  DB: connInfo.path ? connInfo.path.substring(1) : 0,
};

function generateKey(type, state) {
  return ['bull', type, state].join(':');
}

function getQueue(type) {
  return bull(type, {
    redis: redisOptions,
  });
}

function getCounts(redis, cb) {
  async.map(types, getQueueCounts, (err, result) => {
    const obj = {};
    result.forEach((r, i) => {
      obj[types[i]] = r;
    });
    cb(err, obj);
  });

  function getQueueCounts(type, cb) {
    async.series({
      wait(cb) {
        redis.llen(generateKey(type, 'wait'), cb);
      },
      act(cb) {
        redis.llen(generateKey(type, 'active'), cb);
      },
      del(cb) {
        redis.zcard(generateKey(type, 'delayed'), cb);
      },
      comp(cb) {
        redis.scard(generateKey(type, 'completed'), cb);
      },
      fail(cb) {
        redis.scard(generateKey(type, 'failed'), cb);
      },
    }, cb);
  }
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
  const lockKeyName = (job) => `${queueName}:lock:${job.id}`;
  for (let i = 0; i < parallelism; i += 1) {
    processOneJob();
  }
  handleStalledJobs();

  function handleStalledJobs() {
    redis.brpoplpush(processingQueueName, processingQueueName, '0', (err, job) => {
      if (err) {
        console.error(err);
      }
      const jobData = JSON.parse(job);
      if (jobData && jobData.id) {
        // If a job isn't locked, return it to queue
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
        setTimeout(handleStalledJobs, 1000);
      }
    });
  }

  function processOneJob() {
    redis.brpoplpush(queueName, processingQueueName, '0', (err, job) => {
      if (err) {
        console.error(err);
      }
      const jobData = JSON.parse(job);
      processor(jobData, (err) => {
        if (err) {
          console.error(err);
        }
        // Lock the job so we don't requeue it
        redis.setex(lockKeyName(jobData), 300, 1);
        redis.lrem(processingQueueName, 0, job);
        processOneJob();
      });
    });
  }
}

module.exports = {
  getQueue,
  getCounts,
  cleanup,
  runQueue,
};
