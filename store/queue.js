/**
 * Provides methods for working with the job queue
 **/
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
  getCounts,
  runQueue,
  runReliableQueue,
  addJob,
  getJob,
};
