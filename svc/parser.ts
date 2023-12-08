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
import getGcData from '../store/getGcData';
import config from '../config.js';
import queue from '../store/queue';
import { insertMatchPromise } from '../store/queries';
import { promisify } from 'util';
import { buildReplayUrl } from '../util/utility';
import redis from '../store/redis';

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
  const match = job;
  try {
    const gcdata = await getGcData(match);
    let url = buildReplayUrl(gcdata.match_id, gcdata.cluster, gcdata.replay_salt);
    if (NODE_ENV === 'test') {
      url = `https://odota.github.io/testfiles/${match.match_id}_1.dem`;
    }
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
    const result = { ...JSON.parse(stdout), ...match };
    await insertMatchPromise(result, {
      type: 'parsed',
      skipParse: true,
      origin: job.origin,
    });
    const end = Date.now();
    // Log successful parse and timing
    redis.publish('parsed', `[${new Date().toISOString()}] [parser] [success] ${match.match_id} in ${end - start}ms`);
    return true;
  } catch(e) {
    const end = Date.now();
    // Log failed parse and timing
    redis.publish('parsed', `[${new Date().toISOString()}] [parser] [fail] ${match.match_id} in ${end - start}ms`);
    // Rethrow the exception
    throw e;
  }
}
runReliableQueue(
  'parse',
  Number(PARSER_PARALLELISM) || numCPUs,
  parseProcessor
);
