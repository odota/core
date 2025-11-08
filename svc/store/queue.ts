import moment from 'moment';
import redis from './redis.ts';
import db from './db.ts';
import { Redis } from 'ioredis';
import config from '../../config.ts';
import { Client } from 'pg';
import c from 'ansi-colors';

moment.relativeTimeThreshold('ss', 0);

export async function runQueue(
  queueName: QueueName,
  parallelism: number,
  processor: (job: any) => Promise<void>,
  getCapacity?: () => Promise<number>,
) {
  const executor = async (i: number) => {
    // Since this may block, we need a separate client for each parallelism!
    // Otherwise the workers cannot issue redis commands since something is waiting for redis to return a job
    const consumer = new Redis(config.REDIS_URL);
    while (true) {
      // If we have a way to measure capacity, throttle the processing speed based on capacity
      if (getCapacity && i >= (await getCapacity())) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        continue;
      }
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
    executor(i);
  }
}

export async function runReliableQueue(
  queueName: QueueName,
  parallelism: number,
  processor: (job: any, metadata: JobMetadata) => Promise<boolean>,
  getCapacity?: () => Promise<number>,
) {
  const executor = async (i: number) => {
    const consumer = new Client(config.POSTGRES_URL);
    await consumer.connect();
    while (true) {
      // If we have a way to measure capacity, throttle the processing speed based on capacity
      if (getCapacity && i >= (await getCapacity())) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        continue;
      }
      await consumer.query('BEGIN TRANSACTION');
      const result = await consumer.query(
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
        [moment.utc().add(3, 'minute'), queueName],
      );
      const job = result?.rows?.[0];
      if (job) {
        try {
          const success = await processor(job.data, {
            priority: job.priority,
            attempts: job.attempts,
            timestamp: job.timestamp,
          });
          // If the processor returns true, it's successful and we should delete the job and then commit
          if (success || job.attempts <= 0) {
            await consumer.query('DELETE FROM queue WHERE id = $1', [job.id]);
            await consumer.query('COMMIT');
          } else {
            // If the processor returns false, it's an expected failure and we should commit the transaction to consume an attempt
            await consumer.query('COMMIT');
          }
        } catch (e) {
          // If the processor crashes unexpectedly, we should rollback the transaction to not consume an attempt
          await consumer.query('ROLLBACK');
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } else {
        await consumer.query('COMMIT');
        // console.log('no job available, waiting');
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  };
  for (let i = 0; i < parallelism; i++) {
    executor(i);
  }
}

export async function addJob(input: QueueInput) {
  const { name, data } = input;
  return redis.rpush(name, JSON.stringify(data));
}

export async function addReliableJob(
  input: QueueInput,
  options: ReliableQueueOptions,
) {
  const { name, data } = input;
  // if (name === 'parse') {
  //   // Could queue the job for gcdata only in case parsing is held up
  // }
  const dbToUse = options.trx ?? db;
  const { rows } = await dbToUse.raw<{
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
      options.priority ?? 0,
    ],
  );
  const job = rows[0];
  const source = options.caller ?? config.ROLE;
  if (job && source === 'web') {
    const message = c.magenta(
      `[${new Date().toISOString()}] [${
        source
      }] [queue: ${name}] [pri: ${job.priority}] [att: ${job.attempts}] ${
        name === 'parse' ? data.match_id : ''
      }`,
    );
    redis.publish('queue', message);
  }
  return job;
}

export async function getReliableJob(jobId: string) {
  const result = await db.raw('SELECT * FROM queue WHERE id = ?', [
    Number(jobId),
  ]);
  return result.rows[0];
}
