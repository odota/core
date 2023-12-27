/**
 * Processes a queue of parse jobs
 * The actual parsing is done by invoking the Java-based parser.
 * This produces an event stream (newline-delimited JSON)
 * Stream is run through a series of processors to count/aggregate it into a single object
 * This object is passed to insertMatch to persist the data into the database.
 * */
import express from 'express';
import { getOrFetchGcDataWithRetry } from '../store/getGcData';
import config from '../config';
import queue from '../store/queue';
import c from 'ansi-colors';
import { buildReplayUrl, redisCount } from '../util/utility';
import redis from '../store/redis';
import { getOrFetchApiData } from '../store/getApiData';
import { checkIsParsed, saveParseData } from '../store/getParsedData';

const { runReliableQueue } = queue;
const { PORT, PARSER_PORT, PARSER_PARALLELISM } = config;
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
    redisCount(redis, 'parser_job');
    const matchId = job.match_id;

    // Check if match is already parsed
    // Doing the check early means we don't update API or gcdata either if already parsed
    if (await checkIsParsed(matchId)) {
      redisCount(redis, 'reparse');
      if (config.DISABLE_REPARSE) {
        // If high load, we can disable parsing already parsed matches
        log('skip');
        return true;
      }
    }

    // Fetch the API data
    const apiStart = Date.now();
    // The pgroup is used to update player_caches on insert.
    // Since currently gcdata and parse data have no knowledge of anonymity, we pass it from API data
    let { data: apiMatch, error: apiError, pgroup } = await getOrFetchApiData(matchId);
    apiTime = Date.now() - apiStart;
    if (apiError || !apiMatch || !pgroup) {
      log('fail', apiError || 'Missing API data or pgroup');
      return false;
    }

    const { leagueid, duration, start_time } = apiMatch;
    if (!leagueid && Date.now() / 1000 - start_time > 30 * 24 * 60 * 60) {
      redisCount(redis, 'oldparse');
      if (config.DISABLE_OLD_PARSE) {
        // Valve doesn't keep non-league replays for more than a few weeks.
        // Skip even attempting the parse if it's too old
        log('skip');
        return true;
      }
    }

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
    let parseError = await saveParseData(
      matchId,
      url,
      {
        start_time,
        duration,
        leagueid,
        pgroup,
        origin: job.origin,
      },
    );
    parseTime = Date.now() - parseStart;
    if (parseError) {
      console.log('[PARSER] %s: %s', matchId, parseError);
      log('fail', parseError);
      return false;
    }

    // Log successful parse and timing
    log('success');
    return true;
  } catch (e: any) {
    log('crash', e?.message);
    await new Promise(resolve => setTimeout(resolve, 1000));
    // Rethrow the exception
    throw e;
  }

  function log(
    type: 'fail' | 'crash' | 'success' | 'skip',
    error?: string | null,
  ) {
    const end = Date.now();
    const colors: Record<typeof type, 'yellow' | 'red' | 'green' | 'gray'> = {
      fail: 'yellow',
      crash: 'red',
      success: 'green',
      skip: 'gray',
    };
    const message = c[colors[type]](
      `[${new Date().toISOString()}] [parser] [${type}: ${
        end - start
      }ms] [api: ${apiTime}ms] [gcdata: ${gcTime}ms] [parse: ${parseTime}ms] ${
        job.match_id
      }: ${error ?? ''}`,
    );
    redis.publish('parsed', message);
    console.log(message);
    if (type === 'fail') {
      redisCount(redis, 'parser_fail');
    } else if (type === 'crash') {
      redisCount(redis, 'parser_crash');
    } else if (type === 'skip') {
      redisCount(redis, 'parser_skip');
    }
  }
}
runReliableQueue('parse', Number(PARSER_PARALLELISM), parseProcessor);
