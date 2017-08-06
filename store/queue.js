/**
 * Provides methods for working with the job queue
 **/
const config = require('../config');
const bull = require('bull');
const url = require('url');
const async = require('async');
const redis = require('./redis');
const db = require('./db');

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

const types = ['parse'];
const queues = types.map(type => getQueue(type));

function getCounts(redis, cb) {
  async.map(queues,
    (queue, cb) => queue.getJobCounts().then(result => cb(null, result)).catch(cb),
    (err, result) => {
      const obj = {};
      result.forEach((res, i) => {
        obj[types[i]] = res;
      });
      cb(err, obj);
    });
}

function cleanup(redis, cb) {
  async.each(queues, (queue, cb) => {
    async.each(['active', 'completed', 'failed', 'delayed'], (type, cb) => {
      queue.clean(24 * 60 * 60 * 1000, type).then(result => cb(null, result)).catch(cb);
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
      const jobData = JSON.parse(job[1]);
      processor(jobData, (err) => {
        if (err) {
          console.error(err);
        }
        processOneJob();
      });
    });
  }
  for (let i = 0; i < parallelism; i += 1) {
    processOneJob();
  }
}

function runReliableQueue(queueName, parallelism, processor) {
  function processOneJob() {
    db.transaction(async (trx) => {
      const result = await db.raw(`
      UPDATE queue SET attempts = attempts - 1
      WHERE id = (
      SELECT id
      FROM queue
      WHERE type = ?
      ORDER BY id
      FOR UPDATE SKIP LOCKED
      LIMIT 1
      )
      RETURNING *
      `, [queueName]);
      const job = result && result.rows && result.rows[0];
      if (job) {
        processor(job.data, async (err) => {
          if (err) {
            console.error(err);
          }
          if (!err || job.attempts <= 0) {
            await db.raw('DELETE FROM queue WHERE id = ?', [job.id]);
          }
          trx.commit();
          processOneJob();
        });
      } else {
        setTimeout(processOneJob, 3000);
      }
    });
  }
  for (let i = 0; i < parallelism; i += 1) {
    processOneJob();
  }
}

function addJob(queueName, job, options, cb) {
  // TODO handle lifo/backoff
  db.raw('INSERT INTO queue(type, timestamp, attempts, data) VALUES (?, ?, ?, ?) RETURNING *',
    [queueName, new Date(), options.attempts || 1, JSON.stringify(job.data)])
    .asCallback((err, result) => {
      if (err) {
        return cb(err);
      }
      return cb(err, result.rows[0]);
    });
}

function getJob(jobId, cb) {
  db.raw('SELECT * FROM queue WHERE id = ?', [jobId]).asCallback((err, result) => {
    if (err) {
      return cb(err);
    }
    return cb(err, result.rows[0]);
  });
}

module.exports = {
  getQueue,
  getCounts,
  cleanup,
  runQueue,
  runReliableQueue,
  addJob,
  getJob,
};
