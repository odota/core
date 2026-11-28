import redis, { redisCount } from "./redis.ts";
import db, { publishLog } from "./db.ts";
import config from "../../config.ts";
import { Client } from "pg";
import { exhaustive, styleText } from "../util/utility.ts";

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
        try {
          // NOTE: If we fail here we will not retry the job since this is an unreliable queue
          // Just log the error and continue
          await processor(batch, i);
        } catch (e) {
          console.log(e);
        }
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
  await Promise.all([...Array(parallelism).keys()].map((_, i) => executor(i)));
}

export async function runReliableQueue(
  queueName: QueueName,
  parallelism: number,
  processor: (job: any, metadata: JobMetadata) => Promise<boolean>,
  getCapacity?: () => Promise<number>,
) {
  const executor = async (i: number) => {
    let consumer: Client | null = null;
    while (true) {
      // If we have a way to measure capacity, throttle the processing speed based on capacity
      if (getCapacity && i >= (await getCapacity())) {
        if (consumer) {
          await consumer.end();
          consumer = null;
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
        continue;
      }
      if (!consumer) {
        consumer = new Client({
          connectionString: config.POSTGRES_URL,
          application_name: `odota-${config.APP_NAME || "unknown"}-queue`,
        });
        await consumer.connect();
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
        [new Date(Date.now() + 3 * 60 * 1000), queueName],
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
          try {
            const end = Date.now();
            await redis.setex(
              "lastRun:" + config.APP_NAME,
              config.HEALTH_TIMEOUT,
              end - start,
            );
          } catch (e) {
            console.log('Failed to update Redis with lastRun');
          }
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
  await Promise.all([...Array(parallelism).keys()].map((_, i) => executor(i)));
}

/**
 * Runs an async function on a loop, waiting the delay between each iteration.
 *
 * @param func
 * @param delay
 */
export async function runInLoop(func: () => Promise<void>, delay: number) {
  while (true) {
    console.log("running %s", func.name);
    const start = Date.now();
    await func();
    const end = Date.now();
    console.log("%s: %dms", func.name, end - start);
    await redis.setex(
      "lastRun:" + config.APP_NAME,
      config.HEALTH_TIMEOUT,
      end - start,
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

export async function addJob(input: QueueInput) {
  const { name, data } = input;
  return redis.sadd(name, JSON.stringify(data));
}

export async function addReliableJob(
  input: QueueInput,
  options: ReliableQueueOptions,
): Promise<ReliableQueueRow | undefined> {
  const { name, data } = input;
  let jobKey;
  if (name === "parse") {
    jobKey = `${name}:${data.match_id}`;
  } else if (name === "gcdata") {
    jobKey = `${name}:${data.match_id}`;
  } else if (name === "fhQueue") {
    jobKey = `${name}:${data.account_id}`;
  } else if (name === "scenariosQueue") {
    jobKey = `${name}:${data.match_id}`;
  } else if (name === "profileQueue") {
    jobKey = `${name}:${data.account_id}`;
  } else if (name === "mmrQueue") {
    jobKey = `${name}:${data.account_id}`;
  } else if (name === "counts") {
    jobKey = `${name}:${data.match_id}`;
  } else {
    exhaustive(name);
    jobKey = crypto.randomUUID();
  }
  const attempts = options.attempts || 1;
  const priority = options.priority || 0;
  const dbToUse = options.trx ?? db;
  // Workers keep a job's row locked in a transaction while they process it, and ON CONFLICT (even DO NOTHING)
  // waits for that transaction to end. So check for an existing job first (a plain read doesn't wait),
  // otherwise requesting a job that is being processed (e.g. POST /request for a match being parsed)
  // blocks until it finishes and then inserts and runs it again.
  // Use a CTE to simulate RETURNING OLD (Postgres 18+) by returning either the inserted id or existing id,
  // and update priority with SKIP LOCKED if an unlocked existing job has a lower (numerically higher) priority
  const { rows } = await dbToUse.query<
    ReliableQueueRow & { inserted: boolean }
  >(
    `WITH ins AS (
      INSERT INTO queue(type, timestamp, attempts, data, next_attempt_time, priority, job_key)
      SELECT $1, $2, $3, $4, $5, $6, $7
      WHERE NOT EXISTS (SELECT 1 FROM queue WHERE job_key = $7)
      ON CONFLICT(job_key) DO NOTHING
      RETURNING id
    ),
    upd AS (
      UPDATE queue
      SET priority = $6
      WHERE priority > $6
        AND id = (SELECT id FROM queue WHERE job_key = $7 FOR UPDATE SKIP LOCKED)
    ),
    existing AS (
      SELECT id FROM queue WHERE job_key = $7
    )
    SELECT id, TRUE AS inserted FROM ins
    UNION ALL
    SELECT id, FALSE AS inserted FROM existing
    LIMIT 1`,
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
  const row = rows[0];
  const job: ReliableQueueRow | undefined = row
    ? ({ id: row.id } as ReliableQueueRow)
    : undefined;
  const source = options.caller ?? config.APP_NAME;
  if (row?.inserted && source === "web") {
    const message = styleText(
      "magenta",
      `[${new Date().toISOString()}] [${
        source
      }] [queue: ${name}] [pri: ${priority}] [att: ${attempts}] ${
        name === "parse" ? data.match_id : ""
      }`,
    );
    await publishLog("queue", message);
  }
  // No row was inserted if a job with the same key already exists
  if (!row?.inserted) {
    redisCount("dedupe_queue");
  }
  return job;
}

export async function getReliableJob(jobId: string) {
  const result = await db.query("SELECT * FROM queue WHERE id = $1", [
    Number(jobId),
  ]);
  return result.rows[0];
}
