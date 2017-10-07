/**
 * Provides methods for working with the job queue
 * */
const moment = require('moment');
const async = require('async');
const redis = require('./redis');
const db = require('./db');

function runQueue(queueName, parallelism, processor) {
  const processingQueueName = `${queueName}:active`;
  function processOneJob(cb) {
    redis.blpop(queueName, processingQueueName, '0', (err, job) => {
      if (err) {
        throw err;
      }
      const jobData = JSON.parse(job[1]);
      processor(jobData, (err) => {
        if (err) {
          console.error(err);
        }
        process.nextTick(cb);
      });
    });
  }
  for (let i = 0; i < parallelism; i += 1) {
    async.forever(processOneJob, (err) => {
      throw err;
    });
  }
}

function runReliableQueue(queueName, parallelism, processor) {
  function processOneJob(cb) {
    db.transaction((trx) => {
      trx.raw(`
      UPDATE queue SET attempts = attempts - 1, next_attempt_time = ?
      WHERE id = (
      SELECT id
      FROM queue
      WHERE type = ?
      AND (next_attempt_time IS NULL OR next_attempt_time < now())
      ORDER BY priority ASC NULLS LAST, id ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
      )
      RETURNING *
      `, [moment().add(2, 'minute'), queueName]).asCallback((err, result) => {
        const job = result && result.rows && result.rows[0];
        if (err) {
          throw err;
        }
        if (!job) {
          trx.commit();
          console.log('no job available, waiting');
          return setTimeout(cb, 5000);
        }
        return processor(job.data, (err) => {
          if (err) {
            // processor encountered an error, just log it and commit the transaction
            console.error(err);
          }
          if (!err || job.attempts <= 0) {
            // remove the job from the queue if successful or out of attempts
            trx.raw('DELETE FROM queue WHERE id = ?', [job.id]).asCallback((err) => {
              if (err) {
                throw err;
              }
              trx.commit();
              process.nextTick(cb);
            });
          } else {
            trx.commit();
            process.nextTick(cb);
          }
        });
      });
    }).catch((err) => {
      throw err;
    });
  }
  for (let i = 0; i < parallelism; i += 1) {
    async.forever(processOneJob, (err) => {
      throw err;
    });
  }
}

function addJob(queueName, job, options, cb) {
  db.raw(
    `INSERT INTO queue(type, timestamp, attempts, data, next_attempt_time, priority)
  VALUES (?, ?, ?, ?, ?, ?) 
  RETURNING *`,
    [queueName,
      new Date(),
      options.attempts || 1,
      JSON.stringify(job.data),
      new Date(),
      options.priority || 10,
    ],
  )
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
  runQueue,
  runReliableQueue,
  addJob,
  getJob,
};
