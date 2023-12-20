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
import { ApiMatch, getPGroup, insertMatch } from '../store/queries';
import { promisify } from 'util';
import c from 'ansi-colors';
import {
  buildReplayUrl,
  generateJob,
  getSteamAPIData,
  redisCount,
} from '../util/utility';
import redis from '../store/redis';
import db from '../store/db';
import axios from 'axios';

const { runReliableQueue } = queue;
const { PORT, PARSER_PORT, PARSER_HOST, PARSER_PARALLELISM } = config;
const numCPUs = os.cpus().length;
const execPromise = promisify(exec);
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
  let insertTime = 0;
  try {
    // Fetch the API data
    const apiStart = Date.now();
    let apiMatch: ApiMatch;
    try {
      const body = await getSteamAPIData(
        generateJob('api_details', { match_id: job.match_id }).url,
      );
      apiMatch = body.result;
    } catch (e) {
      console.error(e);
      // The Match ID is probably invalid, so fail without throwing
      return false;
    }
    await insertMatch(apiMatch, {
      type: 'api',
      // We're already in the parse context so don't queue another parse job
      skipParse: true,
    });
    apiTime = Date.now() - apiStart;

    // We need pgroup, start_time, duration, leagueid for the next jobs
    const pgroup = getPGroup(apiMatch);
    const { start_time, duration, leagueid } = apiMatch;

    // Fetch the gcdata and construct a replay URL
    const gcStart = Date.now();
    const gcdata = await getGcData({ match_id: job.match_id, pgroup });
    gcTime = Date.now() - gcStart;
    let url = buildReplayUrl(
      gcdata.match_id,
      gcdata.cluster,
      gcdata.replay_salt,
    );

    // Check if match is already parsed
    const isParsed = Boolean(
      (
        await db.raw('select match_id from parsed_matches where match_id = ?', [
          job.match_id,
        ])
      ).rows[0],
    );
    if (isParsed) {
      redisCount(redis, 'reparse');
      if (config.DISABLE_REPARSE) {
        // If high load, we can disable parsing already parsed matches
        return true;
      }
    }

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
    console.log('[PARSER] parsing replay at:', url);
    const { stdout } = await execPromise(
      `curl --max-time 60 --fail -L ${url} | ${
        url && url.slice(-3) === 'bz2' ? 'bunzip2' : 'cat'
      } | curl -X POST -T - ${PARSER_HOST} | node processors/createParsedDataBlob.mjs ${
        job.match_id
      }`,
      //@ts-ignore
      { shell: true, maxBuffer: 10 * 1024 * 1024 },
    );
    parseTime = Date.now() - parseStart;

    const insertStart = Date.now();
    // const { getParseSchema } = await import('../processors/parseSchema.mjs');
    // start_time and duration used for calculating dust adjustments and APM
    const result: ParserMatch = {
      ...JSON.parse(stdout),
      match_id: job.match_id,
      leagueid,
      start_time,
      duration,
    };
    await insertMatch(result, {
      type: 'parsed',
      skipParse: true,
      origin: job.origin,
      pgroup,
      endedAt: start_time + duration,
    });
    insertTime = Date.now() - insertStart;

    // Log successful parse and timing
    const end = Date.now();
    const message = c.green(
      `[${new Date().toISOString()}] [parser] [success: ${
        end - start
      }ms] [api: ${apiTime}ms] [gcdata: ${gcTime}ms] [parse: ${parseTime}ms] [insert: ${insertTime}ms] ${
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
      }ms] [api: ${apiTime}ms] [gcdata: ${gcTime}ms] [parse: ${parseTime}ms] [insert: ${insertTime}ms] ${
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
