const async = require('async');
const utility = require('../util/utility');
const redis = require('../store/redis');
const queries = require('../store/queries');
const config = require('../config');

const generateJob = utility.generateJob;
const getData = utility.getData;
const insertMatch = queries.insertMatch;
const apiKeys = config.STEAM_API_KEY.split(',');
const apiHosts = config.STEAM_API_HOST.split(',');
const parallelism = Math.min(apiHosts.length * 1, apiKeys.length);
const delay = 1000;

function processMatch(matchId, cb) {
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
    const url = job.url;
    return getData({
      url,
      delay,
    }, (err, body) => {
      if (err) {
        throw err;
      }
      if (!body.result) {
        return cb();
      }
      const match = body.result;
      return insertMatch(match, {
        type: 'api',
        origin: 'scanner',
        skipCounts: false,
      }, (err) => {
        if (!err) {
          // Set with long expiration (1 month) to avoid picking up the same matches again
          // If GetMatchHistoryBySequenceNum is out for a long time, this might be a problem
          redis.setex(`scanner_insert:${match.match_id}`, 3600 * 24 * 30, 1);
        }
        cb(err);
      });
    });
  });
}

function processPlayer(accountId, cb) {
  const ajob = generateJob('api_history', {
    account_id: accountId,
  });
  getData({
    url: ajob.url,
    delay,
  }, (err, body) => {
    if (err) {
      console.error(err);
    }
    if (!body || !body.result || !body.result.matches) {
      // Skip this player on this iteration
      return cb();
    }
    return ('match_seq_num', (err, res) => {
      if (err) {
        return cb(err);
      }
      // Get matches with recent seqnums
      const matches = body.result.matches
        .filter(m => m.match_seq_num > Number(res))
        .map(m => m.match_id);
      return async.eachLimit(matches, 1, processMatch, cb);
    });
  });
}

function start(err) {
  if (err) {
    throw err;
  }
  console.log('starting backupscanner loop');
  setTimeout(() => {
    redis.zrange('tracked', 0, -1, (err, ids) => {
      if (err) {
        throw err;
      }
      async.eachLimit(ids, parallelism, processPlayer, start);
    });
  }, 1000);
}

start();
