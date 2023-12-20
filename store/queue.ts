import moment from 'moment';
import redis from './redis';
import db from './db';
import { Redis } from 'ioredis';
import config from '../config.js';

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
    while (true) {
      const trx = await db.transaction();
      const result = await trx.raw(
        `
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
      `,
        //@ts-ignore
        [moment().add(5, 'minute'), queueName],
      );
      const job = result && result.rows && result.rows[0];
      if (job) {
        // Handle possible exception here since we still need to commit the transaction to update attempts
        let success = false;
        try {
          success = await processor(job.data);
        } catch (e) {
          // Don't crash the process as we expect some processing failures
          console.error(e);
        }
        if (success || job.attempts <= 0) {
          // remove the job from the queue if successful or out of attempts
          await trx.raw('DELETE FROM queue WHERE id = ?', [job.id]);
        }
        await trx.commit();
      } else {
        await trx.commit();
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
  const result = await db.raw('SELECT * FROM queue WHERE id = ?', [jobId]);
  return result.rows[0];
}

export default {
  runQueue,
  runReliableQueue,
  addReliableJob,
  getReliableJob,
  addJob,
};
