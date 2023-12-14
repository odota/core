/**
 * Processes a queue of parse jobs
 * The actual parsing is done by invoking the Java-based parser.
 * This produces an event stream (newline-delimited JSON)
 * Stream is run through a series of processors to count/aggregate it into a single object
 * This object is passed to insertMatch to persist the data into the database.
 * */
import { exec } from 'child_process';
import os from 'os';
import express from 'express';
import { getGcData } from '../store/getGcData';
import config from '../config.js';
import queue from '../store/queue';
import { insertMatchPromise } from '../store/queries';
import { promisify } from 'util';
import c from 'ansi-colors';
import { buildReplayUrl, redisCount } from '../util/utility';
import redis from '../store/redis';
import db from '../store/db';

const { runReliableQueue } = queue;
const { PORT, PARSER_PORT, NODE_ENV, PARSER_HOST, PARSER_PARALLELISM } = config;
const numCPUs = os.cpus().length;
const execPromise = promisify(exec);
const app = express();
app.get('/healthz', (req, res) => {
  res.end('ok');
});
app.listen(PORT || PARSER_PORT);

async function parseProcessor(job: ParseJob) {
  const start = Date.now();
  let gcTime = 0;
  let parseTime = 0;
  let insertTime = 0;
  const match = job;
  try {
    // Fetch the gcdata and construct a replay URL
    const gcStart = Date.now();
    const gcdata = await getGcData(match);
    gcTime = Date.now() - gcStart;
    let url = buildReplayUrl(
      gcdata.match_id,
      gcdata.cluster,
      gcdata.replay_salt
    );
    if (NODE_ENV === 'test') {
      url = `https://odota.github.io/testfiles/${match.match_id}_1.dem`;
    }

    // Check if match is already parsed
    const isParsed = Boolean(
      (
        await db.raw(
          'select match_id from parsed_matches where match_id = ?',
          [match.match_id]
        )
      ).rows[0]
    );
    if (isParsed) {
      redisCount(redis, 'reparse');
      if (config.DISABLE_REPARSE) {
        // If high load, we can disable parsing already parsed matches
        return true;
      }
    }

    const parseStart = Date.now();
    console.log('[PARSER] parsing replay at:', url);
    const { stdout } = await execPromise(
      `curl --max-time 60 --fail -L ${url} | ${
        url && url.slice(-3) === 'bz2' ? 'bunzip2' : 'cat'
      } | curl -X POST -T - ${PARSER_HOST} | node processors/createParsedDataBlob.mjs ${
        match.match_id
      }`,
      //@ts-ignore
      { shell: true, maxBuffer: 10 * 1024 * 1024 }
    );
    parseTime = Date.now() - parseStart;

    const insertStart = Date.now();
    const result = { ...JSON.parse(stdout), ...match };
    await insertMatchPromise(result, {
      type: 'parsed',
      skipParse: true,
      origin: job.origin,
    });
    insertTime = Date.now() - insertStart;

    // Log successful parse and timing
    const end = Date.now();
    const message = c.green(
      `[${new Date().toISOString()}] [parser] [success: ${
        end - start
      }ms] [gcdata: ${gcTime}ms] [parse: ${parseTime}ms] [insert: ${insertTime}ms] ${
        match.match_id
      }`
    );
    redis.publish('parsed', message);
    console.log(message);
    return true;
  } catch (e) {
    const end = Date.now();
    // Log failed parse and timing
    const message = c.red(
      `[${new Date().toISOString()}] [parser] [fail: ${
        end - start
      }ms] [gcdata: ${gcTime}ms] [parse: ${parseTime}ms] [insert: ${insertTime}ms] ${
        match.match_id
      }`
    );
    redis.publish('parsed', message);
    console.log(message);
    redisCount(redis, 'parser_fail');
    // Rethrow the exception
    throw e;
  }
}
runReliableQueue(
  'parse',
  Number(PARSER_PARALLELISM) || numCPUs,
  parseProcessor
);
