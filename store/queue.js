/**
 * Provides methods for working with the job queue
 **/
const config = require('../config');
const bull = require('bull');
const url = require('url');
const async = require('async');
const redis = require('./redis');
const types = ['request', 'parse', 'fullhistory'];
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

function addToQueue(queue, payload, options, cb) {
  const job = {
    payload: payload
  };
  options.attempts = options.attempts || 15;
  options.backoff = options.backoff || {
    delay: 60 * 1000,
    type: 'exponential',
  };
  queue.add(job, options).then((queuejob) => {
    // console.log("created %s jobId: %s", queue.name, queuejob.jobId);
    cb(null, queuejob);
  }).catch(cb);
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
  for (let i = 0; i < parallelism; i += 1) {
    single();
  }

  function single() {
    redis.blpop(queueName, '0', (err, job) => {
      if (err) {
        console.error(err);
      }
      // 0 is name of queue
      // 1 is job data
      processor(JSON.parse(job[1]), (err) => {
        if (err) {
          console.error(err);
        }
        single();
      });
    });
  }
}

module.exports = {
  getQueue,
  addToQueue,
  getCounts,
  cleanup,
  runQueue,
};
