// Alternative to scanner if seq match data endpoint isn't available
// Works by repeatedly checking match histories for players
import async from 'async';
import redis from '../store/redis.mts';
import { insertMatchPromise } from '../store/queries.mts';
import config from '../config.js';
import { generateJob, getData } from '../util/utility.mts';
const apiKeys = config.STEAM_API_KEY.split(',');
const apiHosts = config.STEAM_API_HOST.split(',');
const parallelism = Math.min(apiHosts.length * 1, apiKeys.length);
const delay = 1000;
function processMatch(matchId: number, cb: ErrorCb) {
  // Check if exists
  redis.get(`scanner_insert:${matchId}`, (err, res) => {
    if (err) {
      return cb(err);
    }
    if (res) {
      return cb();
    }
    const job = generateJob('api_details', {
      match_id: matchId,
    });
    const { url } = job;
    return getData(
      {
        url,
        delay,
      },
      async (err: any, body: any) => {
        if (err) {
          throw err;
        }
        if (!body.result) {
          return cb();
        }
        const match = body.result;
        try {
          await insertMatchPromise(match, {
            type: 'api',
            origin: 'scanner',
            skipCounts: false,
          });
          // Set with long expiration (1 month) to avoid picking up the same matches again
          // If GetMatchHistoryBySequenceNum is out for a long time, this might be a problem
          redis.setex(`scanner_insert:${match.match_id}`, 3600 * 24 * 30, 1);
          cb();
        } catch (e) {
          cb(e);
        }
      }
    );
  });
}
function processPlayer(accountId: string, cb: ErrorCb) {
  const ajob = generateJob('api_history', {
    account_id: accountId,
  });
  getData(
    {
      url: ajob.url,
      delay,
    },
    (err: any, body: any) => {
      if (err) {
        console.error(err);
      }
      if (!body || !body.result || !body.result.matches) {
        // Skip this player on this iteration
        return cb();
      }
      return redis.get('match_seq_num', (err, res) => {
        if (err) {
          return cb(err);
        }
        // Get matches with recent seqnums
        const matches = body.result.matches
          .filter((m: any) => m.match_seq_num > Number(res))
          .map((m: any) => m.match_id);
        return async.eachLimit(matches, 1, processMatch, cb);
      });
    }
  );
}
function start(err?: any) {
  if (err) {
    throw err;
  }
  console.log('starting backupscanner loop');
  setTimeout(() => {
    redis.zrange('tracked', 0, -1, (err, ids) => {
      if (err) {
        throw err;
      }
      if (ids) {
        async.eachLimit(ids, parallelism, processPlayer, start);
      }
    });
  }, 1000);
}
start();
