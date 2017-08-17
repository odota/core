/**
 * Provides methods for working with the job queue
 * */
const moment = require('moment');
const redis = require('./redis');
const db = require('./db');

function getCounts(redis, cb) {
  cb(null, []);
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
    return db.transaction((trx) => {
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
      `, [moment().add(1, 'minute'), queueName]).asCallback((err, result) => {
        const job = result && result.rows && result.rows[0];
        if (err) {
          return trx.rollback(err);
        }
        if (!job) {
          return trx.rollback(new Error('no job available'));
        }
        return processor(job.data, (err) => {
          if (err) {
            // processor encountered an error, just log it and commit the transaction
            console.error(err);
          }
          if (!err || job.attempts <= 0) {
            // remove the job from the queue if successful or out of attempts
            return trx.raw('DELETE FROM queue WHERE id = ?', [job.id]).asCallback((err) => {
              if (err) {
                return trx.rollback(err);
              }
              return trx.commit();
            });
          }
          return trx.commit();
        });
      });
    })
      .then(processOneJob)
      .catch((err) => {
        console.error(err);
        setTimeout(processOneJob, 5000);
      });
  }
  for (let i = 0; i < parallelism; i += 1) {
    processOneJob();
  }
}

function addJob(queueName, job, options, cb) {
  db.raw('INSERT INTO queue(type, timestamp, attempts, data, next_attempt_time, priority) VALUES (?, ?, ?, ?, ?, ?) RETURNING *',
    [queueName, new Date(), options.attempts || 1, JSON.stringify(job.data), new Date(), options.priority || 10])
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
  getCounts,
  runQueue,
  runReliableQueue,
  addJob,
  getJob,
};
