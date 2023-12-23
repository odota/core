import moment from 'moment';
import redis from './redis';
import db from './db';
import { Redis } from 'ioredis';
import config from '../config';
import { Client } from 'pg';

async function runQueue(
  queueName: QueueName,
  parallelism: number,
  processor: (job: any) => Promise<void>,
) {
  const executor = async () => {
    // Since this may block, we need a separate client for each parallelism!
    // Otherwise the workers cannot issue redis commands since something is waiting for redis to return a job
    const consumer = new Redis(config.REDIS_URL);
    while (true) {
      const job = await consumer.blpop(queueName, '0');
      if (job) {
        const jobData = JSON.parse(job[1]);
        try {
          await processor(jobData);
        } catch (e) {
          // We failed in the unreliable queue, so we won't reprocess the job
          // Log the error
          console.error(e);
          // If parallelism is 1, we can crash and get restarted
          // If parallelism is > 1, we don't want to interrupt other jobs so just continue
          if (parallelism === 1) {
            process.exit(1);
          }
        }
      }
    }
  };
  for (let i = 0; i < parallelism; i++) {
    executor();
  }
  process.on('unhandledRejection', (reason, p) => {
    // In production pm2 doesn't appear to auto restart unless we exit the process here
    console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
    process.exit(1);
  });
}

async function runReliableQueue(
  queueName: QueueName,
  parallelism: number,
  processor: (job: any) => Promise<boolean>,
) {
  const executor = async () => {
    const pg = new Client(config.POSTGRES_URL);
    await pg.connect();
    while (true) {
      await pg.query('BEGIN TRANSACTION');
      const result = await pg.query(
        `
      UPDATE queue SET attempts = attempts - 1, next_attempt_time = $1
      WHERE id = (
      SELECT id
      FROM queue
      WHERE type = $2
      AND (next_attempt_time IS NULL OR next_attempt_time < now())
      ORDER BY priority ASC NULLS LAST, id ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
      )
      RETURNING *
      `,
        [moment().add(5, 'minute'), queueName],
      );
      const job = result && result.rows && result.rows[0];
      if (job) {
        try {
          const success = await processor(job.data);
          // If the processor returns true, it's successful and we should delete the job and then commit
          if (success || job.attempts <= 0) {
            await pg.query('DELETE FROM queue WHERE id = $1', [job.id]);
            await pg.query('COMMIT');
          } else {
            // If the processor returns false, it's an expected failure and we should commit the transaction to consume an attempt
            await pg.query('COMMIT');
          }
        } catch (e) {
          // If the processor crashes unexpectedly, we should rollback the transaction to not consume an attempt
          await pg.query('ROLLBACK');
        }
      } else {
        await pg.query('COMMIT');
        // console.log('no job available, waiting');
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  };
  for (let i = 0; i < parallelism; i++) {
    executor();
  }
  process.on('unhandledRejection', (reason, p) => {
    // In production pm2 doesn't appear to auto restart unless we exit the process here
    console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
    process.exit(1);
  });
}

async function addJob(input: QueueInput) {
  const { name, data } = input;
  return redis.rpush(name, JSON.stringify(data));
}

async function addReliableJob(
  input: QueueInput,
  options: ReliableQueueOptions,
) {
  const { name, data } = input;
  const result = await db.raw<{
    rows: ReliableQueueRow[];
  }>(
    `INSERT INTO queue(type, timestamp, attempts, data, next_attempt_time, priority)
  VALUES (?, ?, ?, ?, ?, ?) 
  RETURNING *`,
    [
      name,
      new Date(),
      options.attempts || 1,
      JSON.stringify(data),
      new Date(),
      options.priority || 10,
    ],
  );
  return result.rows[0];
}
async function getReliableJob(jobId: string) {
  const result = await db.raw('SELECT * FROM queue WHERE id = ?', [Number(jobId)]);
  return result.rows[0];
}

export default {
  runQueue,
  runReliableQueue,
  addReliableJob,
  getReliableJob,
  addJob,
};
