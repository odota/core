/**
 * Worker scanning the Steam sequential match API (GetMatchHistoryBySequenceNum) for latest matches.
 * Note that the limit for this endpoint seems to be around 5 calls/IP/minute
 * The endpoint usually takes around 2 seconds to return data
 * Therefore each IP should generally avoid requesting more than once every 10 seconds
 * */
const utility = require('../util/utility');
const config = require('../config');
const redis = require('../store/redis');
const queries = require('../store/queries');
const async = require('async');

const { insertMatch } = queries;
const { getData, generateJob } = utility;
// const api_hosts = config.STEAM_API_HOST.split(',');
const delay = Number(config.SCANNER_DELAY);
const PAGE_SIZE = 100;

function scanApi(seqNum) {
  let nextSeqNum = seqNum;
  let delayNextRequest = false;

  function processMatch(match, cb) {
    function finishMatch(err, cb) {
      if (err) {
        console.error('failed to insert match from scanApi %s', match.match_id);
      }
      return cb(err);
    }
    // Optionally throttle inserts to prevent overload
    if ((match.match_id % 100) >= Number(config.SCANNER_PERCENT)) {
      return finishMatch(null, cb);
    }
    // check if match was previously processed
    return redis.get(`scanner_insert:${match.match_id}`, (err, result) => {
      if (err) {
        return finishMatch(err, cb);
      }
      // don't insert this match if we already processed it recently
      if (!result) {
        return insertMatch(match, {
          type: 'api',
          origin: 'scanner',
        }, (err) => {
          if (!err) {
            // Save match_id in Redis to avoid duplicate inserts (persist even if process restarts)
            redis.setex(`scanner_insert:${match.match_id}`, 3600 * 4, 1);
          }
          finishMatch(err, cb);
        });
      }
      return finishMatch(err, cb);
    });
  }

  function processPage(matchSeqNum, cb) {
    const container = generateJob('api_sequence', {
      start_at_match_seq_num: matchSeqNum,
    });
    getData({
      url: container.url,
      delay,
    }, (err, data) => {
      if (err) {
        return cb(err);
      }
      const resp = data.result && data.result.matches ? data.result.matches : [];
      if (resp.length) {
        nextSeqNum = resp[resp.length - 1].match_seq_num + 1;
      }
      if (resp.length < PAGE_SIZE) {
        delayNextRequest = true;
      }
      console.log('[API] match_seq_num:%s, matches:%s', matchSeqNum, resp.length);
      return async.each(resp, processMatch, cb);
    });
  }

  function finishPageSet(err) {
    if (err) {
      // something bad happened, retry this page
      console.error(err.stack || err);
      return scanApi(seqNum);
    }
    console.log('next_seq_num: %s', nextSeqNum);
    redis.set('match_seq_num', nextSeqNum);
    // Completed inserting matches on this page
    // If not a full page, delay the next iteration
    return setTimeout(() => scanApi(nextSeqNum), delayNextRequest ? 3000 : 0);
  }

  processPage(seqNum, finishPageSet);
}
if (config.START_SEQ_NUM) {
  redis.get('match_seq_num', (err, result) => {
    if (err || !result) {
      throw new Error('failed to get match_seq_num from redis, waiting to retry');
    }
    const numResult = Number(result);
    scanApi(numResult);
  });
} else if (config.NODE_ENV !== 'production') {
  // Never do this in production to avoid skipping sequence number if we didn't pull .env properly
  const container = generateJob('api_history', {});
  getData(container.url, (err, data) => {
    if (err) {
      throw new Error('failed to get sequence number from webapi');
    }
    scanApi(data.result.matches[0].match_seq_num);
  });
} else {
  throw new Error('failed to initialize sequence number');
}
process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
  throw p;
});
