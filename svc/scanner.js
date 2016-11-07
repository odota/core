/**
 * Worker scanning the Steam sequential match API (GetMatchHistoryBySequenceNum) for latest matches.
 * Note that the limit for this endpoint seems to be around 5 calls/IP/minute
 * The endpoint usually takes around 2 seconds to return data
 * Therefore each IP should generally avoid requesting more than once every 10 seconds
 **/
const utility = require('../util/utility');
const config = require('../config');
const redis = require('../store/redis');
const queries = require('../store/queries');
const insertMatch = queries.insertMatch;
const getData = utility.getData;
const generateJob = utility.generateJob;
const async = require('async');
// const api_hosts = config.STEAM_API_HOST.split(',');
const delay = Number(config.SCANNER_DELAY);
const PAGE_SIZE = 100;
start();

function start() {
  if (config.START_SEQ_NUM) {
    redis.get('match_seq_num', (err, result) => {
      if (err || !result) {
        console.log('failed to get match_seq_num from redis, waiting to retry');
        return setTimeout(start, 10000);
      }
      result = Number(result);
      scanApi(result);
    });
  } else if (config.NODE_ENV !== 'production') {
    // Never do this in production to avoid skipping sequence number if we didn't pull .env properly
    const container = generateJob('api_history', {});
    getData(container.url, (err, data) => {
      if (err) {
        console.log('failed to get sequence number from webapi');
        return start();
      }
      scanApi(data.result.matches[0].match_seq_num);
    });
  } else {
    throw 'failed to initialize sequence number';
  }

  function scanApi(seqNum) {
    let nextSeqNum = seqNum;
    let delayNextRequest = false;
    processPage(seqNum, finishPageSet);

    function processPage(match_seq_num, cb) {
      const container = generateJob('api_sequence', {
        start_at_match_seq_num: match_seq_num,
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
        console.log('[API] match_seq_num:%s, matches:%s', match_seq_num, resp.length);
        async.each(resp, processMatch, cb);
      });
    }

    function processMatch(match, cb) {
      // Optionally throttle inserts to prevent overload
      if ((match.match_id % 100) >= Number(config.SCANNER_PERCENT)) {
        return finishMatch();
      }
      // check if match was previously processed
      redis.get(`scanner_insert:${match.match_id}`, (err, result) => {
        if (err) {
          return finishMatch(err);
        }
        // don't insert this match if we already processed it recently
        if (!result) {
          insertMatch(match, {
            type: 'api',
            origin: 'scanner',
          }, (err) => {
            if (!err) {
              // Save match_id in Redis to avoid duplicate inserts (persist even if process restarts)
              redis.setex(`scanner_insert:${match.match_id}`, 3600 * 8, 1);
            }
            finishMatch(err);
          });
        } else {
          finishMatch(err);
        }
      });

      function finishMatch(err) {
        if (err) {
          console.error('failed to insert match from scanApi %s', match.match_id);
        }
        return cb(err);
      }
    }

    function finishPageSet(err) {
      if (err) {
        // something bad happened, retry this page
        console.error(err.stack || err);
        return scanApi(seqNum);
      } else {
        console.log('next_seq_num: %s', nextSeqNum);
        redis.set('match_seq_num', nextSeqNum);
        // Completed inserting matches on this page
        // If not a full page, delay the next iteration
        return setTimeout(() =>
           scanApi(nextSeqNum)
        , delayNextRequest ? 3000 : 0);
      }
    }
  }
}
