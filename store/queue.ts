import moment from 'moment';
import redis from './redis';
import db from './db';

async function runQueue(
  queueName: QueueName,
  parallelism: number,
  processor: (job: any) => Promise<void>
) {
  Array.from(new Array(parallelism), (v, i) => i).forEach(async (i) => {
    try {
      while (true) {
        const job = await redis.blpop(queueName, '0');
        if (job) {
          const jobData = JSON.parse(job[1]);
          await processor(jobData);
        }
      }
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  });
}

async function runReliableQueue(
  queueName: QueueName,
  parallelism: number,
  processor: (job: any) => Promise<boolean>
) {
  Array.from(new Array(parallelism), (v, i) => i).forEach(async (i) => {
    try {
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
          [moment().add(5, 'minute'), queueName]
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
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  });
}

function addJob(queueName: 'mmrQueue', job: MmrJob): Promise<number>;
function addJob(queueName: 'countsQueue', job: CountsJob): Promise<number>;
function addJob(queueName: 'fhQueue', job: FullHistoryJob): Promise<number>;
function addJob(queueName: 'gcQueue', job: GcDataJob): Promise<number>;
function addJob(queueName: 'scenariosQueue', job: ScenariosJob): Promise<number>;
async function addJob(queueName: QueueName, job: QueueJob) {
  return await redis.rpush(queueName, JSON.stringify(job));
}

function addReliableJob(queueName: 'parse', job: { data: ParseJob }, options: ReliableQueueOptions): Promise<ReliableQueueRow>;
async function addReliableJob(
  queueName: QueueName,
  job: { data: QueueJob },
  options: ReliableQueueOptions
) {
  const result = await db.raw<{
    rows: ReliableQueueRow[];
  }>(
    `INSERT INTO queue(type, timestamp, attempts, data, next_attempt_time, priority)
  VALUES (?, ?, ?, ?, ?, ?) 
  RETURNING *`,
    [
      queueName,
      new Date(),
      options.attempts || 1,
      JSON.stringify(job.data),
      new Date(),
      options.priority || 10,
    ]
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
