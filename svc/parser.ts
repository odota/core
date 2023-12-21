/**
 * Processes a queue of parse jobs
 * The actual parsing is done by invoking the Java-based parser.
 * This produces an event stream (newline-delimited JSON)
 * Stream is run through a series of processors to count/aggregate it into a single object
 * This object is passed to insertMatch to persist the data into the database.
 * */
import os from 'os';
import express from 'express';
import { getOrFetchGcData } from '../store/getGcData';
import config from '../config.js';
import queue from '../store/queue';
import type { ApiMatch } from '../store/pgroup';
import c from 'ansi-colors';
import { buildReplayUrl, redisCount } from '../util/utility';
import redis from '../store/redis';
import axios from 'axios';
import { getPGroup } from '../store/pgroup';
import { getOrFetchApiData } from '../store/getApiData';
import { maybeFetchParseData } from '../store/getParsedData';

const { runReliableQueue } = queue;
const { PORT, PARSER_PORT, PARSER_PARALLELISM } = config;
const numCPUs = os.cpus().length;
const app = express();
app.get('/healthz', (req, res) => {
  res.end('ok');
});
app.listen(PORT || PARSER_PORT);

async function parseProcessor(job: ParseJob) {
  const start = Date.now();
  let apiTime = 0;
  let gcTime = 0;
  let parseTime = 0;
  try {
    const matchId = job.match_id;
    // Fetch the API data
    const apiStart = Date.now();
    let apiMatch: ApiMatch;
    try {
      apiMatch = await getOrFetchApiData(matchId);
    } catch (e) {
      console.error(e);
      // The Match ID is probably invalid, so fail without throwing
      return false;
    }
    apiTime = Date.now() - apiStart;

    // We need pgroup for the next jobs
    const pgroup = getPGroup(apiMatch);

    // Fetch the gcdata and construct a replay URL
    const gcStart = Date.now();
    const gcdata = await getOrFetchGcData(matchId, pgroup);
    gcTime = Date.now() - gcStart;
    let url = buildReplayUrl(
      gcdata.match_id,
      gcdata.cluster,
      gcdata.replay_salt,
    );

    // try {
    //   // Make a HEAD request for the replay to see if it's available
    //   await axios.head(url);
    // } catch(e: any) {
    //   // If 404 the replay can't be found, too soon or it's expired
    //   // return false to fail the job without throwing exception
    //   if (e.response.status === 404) {
    //     return false;
    //   } else {
    //     throw e;
    //   }
    // }

    const parseStart = Date.now();
    const { start_time, duration, leagueid } = apiMatch;
    await maybeFetchParseData(matchId, url, {
      start_time,
      duration,
      leagueid,
      pgroup,
      origin: job.origin,
    });
    parseTime = Date.now() - parseStart;

    // Log successful parse and timing
    const end = Date.now();
    const message = c.green(
      `[${new Date().toISOString()}] [parser] [success: ${
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
