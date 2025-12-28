import moment from "moment";
import redis, { redisCount } from "./redis.ts";
import db from "./db.ts";
import config from "../../config.ts";
import { Client } from "pg";
import c from "ansi-colors";

moment.relativeTimeThreshold("ss", 0);

export async function runQueue<T>(
  queueName: QueueName,
  parallelism: number,
  batchSize: number,
  processor: (batch: T[], i: number) => Promise<void>,
  getCapacity?: () => Promise<number>,
) {
  const executor = async (i: number) => {
    while (true) {
      // If we have a way to measure capacity, throttle the processing speed based on capacity
      if (getCapacity && i >= (await getCapacity())) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        continue;
      }
      const resp = await redis.spop(queueName, batchSize);
      const batch = resp.map((el) => JSON.parse(el) as T);
      const start = Date.now();
      if (batch?.length) {
        // Note: If we fail here we will crash the process and possibly interrupt other parallel workers
        // Handle errors in the processor to mitigate this
        // The job will not be retried since this is an unreliable queue
        await processor(batch, i);
      } else {
        // Wait before trying again
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      const end = Date.now();
      await redis.setex(
        "lastRun:" + config.APP_NAME,
        config.HEALTH_TIMEOUT,
        end - start,
      );
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
      const start = Date.now();
      await consumer.query("BEGIN TRANSACTION");
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
        [moment.utc().add(3, "minute"), queueName],
      );
      const job = result?.rows?.[0];
      if (job) {
        try {
          const success = await processor(job.data, {
            priority: job.priority,
            attempts: job.attempts,
            timestamp: job.timestamp,
            jobId: job.id,
            i,
          });
          // If the processor returns true or out of attempts, it's successful and we should delete the job and then commit
          // Otherwise, it's an expected failure and we should commit the transaction to consume an attempt
          if (success || job.attempts <= 0) {
            await consumer.query("DELETE FROM queue WHERE id = $1", [job.id]);
          }
          await consumer.query("COMMIT");
          const end = Date.now();
          await redis.setex(
            "lastRun:" + config.APP_NAME,
            config.HEALTH_TIMEOUT,
            end - start,
          );
        } catch (e) {
          console.log(e);
          // If the processor crashes unexpectedly, we should rollback the transaction to not consume an attempt
          await consumer.query("ROLLBACK");
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } else {
        await consumer.query("COMMIT");
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
  return redis.sadd(name, JSON.stringify(data));
}

function exhaustive(name: never) {
  console.log("Unhandled queue name case: %s", name);
}

export async function addReliableJob(
  input: QueueInput,
  options: ReliableQueueOptions,
): Promise<ReliableQueueRow | undefined> {
  const { name, data } = input;
  let jobKey;
  if (name === "parse") {
    jobKey = `${name}:${data.match_id}${data.gcDataOnly ? ":1" : ""}`;
  } else if (name === "fhQueue") {
    jobKey = `${name}:${data.account_id}`;
  } else if (name === "scenariosQueue") {
    jobKey = `${name}:${data.match_id}`;
  } else if (name === "profileQueue") {
    jobKey = `${name}:${data.account_id}`;
  } else if (name === "mmrQueue") {
    jobKey = `${name}:${data.account_id}`;
  } else if (name === "cacheQueue") {
    jobKey = `${name}:${data.account_id}`;
  } else {
    exhaustive(name);
    jobKey = crypto.randomUUID();
  }
  const attempts = options.attempts || 1;
  const priority = options.priority || 0;
  const dbToUse = options.trx ?? db;
  const { rows } = await dbToUse.raw<{
    rows: ReliableQueueRow[];
  }>(
    `INSERT INTO queue(type, timestamp, attempts, data, next_attempt_time, priority, job_key)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT DO NOTHING
    RETURNING id`,
    [
      name,
      new Date(),
      attempts,
      JSON.stringify(data),
      new Date(Date.now() + (options.delayMs ?? 0)),
      priority,
      jobKey,
    ],
  );
  let job = rows[0];
  const source = options.caller ?? config.APP_NAME;
  if (job && source === "web") {
    const message = c.magenta(
      `[${new Date().toISOString()}] [${
        source
      }] [queue: ${name}] [pri: ${priority}] [att: ${attempts}] ${
        name === "parse" ? data.match_id : ""
      }`,
    );
    await redis.publish("queue", message);
  }
  // This might be undefined if a job with the same key already exists. Try to find it
  // May not exist anymore if the job finished in the meantime
  // Note: In Postgres 18+ we can use RETURNING with OLD to fetch the old id and return it
  if (!job) {
    redisCount("dedupe_queue");
    const { rows } = await dbToUse.raw<{
      rows: ReliableQueueRow[];
    }>("SELECT id from queue WHERE job_key = ?", [jobKey]);
    job = rows[0];
  }
  return job;
}

export async function getReliableJob(jobId: string) {
  const result = await db.raw("SELECT * FROM queue WHERE id = ?", [
    Number(jobId),
  ]);
  return result.rows[0];
}
