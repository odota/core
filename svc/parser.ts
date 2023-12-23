/**
 * Processes a queue of parse jobs
 * The actual parsing is done by invoking the Java-based parser.
 * This produces an event stream (newline-delimited JSON)
 * Stream is run through a series of processors to count/aggregate it into a single object
 * This object is passed to insertMatch to persist the data into the database.
 * */
import os from 'os';
import express from 'express';
import { getOrFetchGcDataWithRetry } from '../store/getGcData';
import config from '../config';
import queue from '../store/queue';
import c from 'ansi-colors';
import { buildReplayUrl, redisCount } from '../util/utility';
import redis from '../store/redis';
import { getPGroup } from '../store/pgroup';
import { getOrFetchApiData } from '../store/getApiData';
import { getOrFetchParseData } from '../store/getParsedData';

const { runReliableQueue } = queue;
const { PORT, PARSER_PORT, PARSER_PARALLELISM } = config;
const numCPUs = os.cpus().length;
const app = express();
app.get('/healthz', (req, res) => {
  res.end('ok');
});
app.listen(PORT || PARSER_PORT);

async function parseProcessor(job: ParseJob) {
  // NOTE: We don't currently distinguish between infra failures (e.g. db down) and expected failure (e.g. bad match ID or replay not found)
  // In the first case, we probably don't want to consume an attempt and in the second we do
  const start = Date.now();
  let apiTime = 0;
  let gcTime = 0;
  let parseTime = 0;
  try {
    redisCount(redis, 'parser_job');
    const matchId = job.match_id;
    // Fetch the API data
    const apiStart = Date.now();
    let { data: apiMatch, error: apiError } = await getOrFetchApiData(matchId);
    if (apiError || !apiMatch) {
      console.log('[PARSER] %s: %s', matchId, apiError);
      return false;
    }
    apiTime = Date.now() - apiStart;

    // We need pgroup for the next jobs
    const pgroup = getPGroup(apiMatch);

    // Fetch the gcdata and construct a replay URL
    const gcStart = Date.now();
    const gcdata = await getOrFetchGcDataWithRetry(matchId, pgroup);
    gcTime = Date.now() - gcStart;
    let url = buildReplayUrl(
      gcdata.match_id,
      gcdata.cluster,
      gcdata.replay_salt,
    );

    const parseStart = Date.now();
    const { start_time, duration, leagueid } = apiMatch;
    let { error: parseError, skipParse } = await getOrFetchParseData(matchId, url, {
      start_time,
      duration,
      leagueid,
      pgroup,
      origin: job.origin,
    });
    if (parseError) {
      console.log('[PARSER] %s: %s', matchId, parseError);
      return false;
    }
    parseTime = Date.now() - parseStart;

    // Log successful/skipped parse and timing
    const end = Date.now();
    const color = skipParse ? 'gray' : 'green';
    const message = c[color](
      `[${new Date().toISOString()}] [parser] [${skipParse ? 'skip' : 'success'}: ${
        end - start
      }ms] [api: ${apiTime}ms] [gcdata: ${gcTime}ms] [parse: ${parseTime}ms] ${
        job.match_id
      }`,
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
      }ms] [api: ${apiTime}ms] [gcdata: ${gcTime}ms] [parse: ${parseTime}ms] ${
        job.match_id
      }`,
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
  parseProcessor,
);
