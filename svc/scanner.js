/**
 * Worker scanning the Steam sequential match API (GetMatchHistoryBySequenceNum) for latest matches.
 **/
const utility = require('../util/utility');
const config = require('../config');
const buildSets = require('../store/buildSets');
const db = require('../store/db');
const cassandra = config.ENABLE_CASSANDRA_MATCH_STORE_WRITE ? require('../store/cassandra') : undefined;
const redis = require('../store/redis');
const queries = require('../store/queries');
const insertMatch = queries.insertMatch;
const getData = utility.getData;
const generateJob = utility.generateJob;
const async = require('async');
const parallelism = config.SCANNER_PARALLELISM;
// const api_hosts = config.STEAM_API_HOST.split(',');
// note that the limit for this endpoint seems to be around 5 calls/IP/minute
// endpoint usually takes around 2 seconds to return data
// therefore each IP should generally avoid requesting more than once every 10 seconds
const delay = Number(config.SCANNER_DELAY);
const PAGE_SIZE = 100;
buildSets(db, redis, (err) => {
  if (err) {
    throw err;
  }
  start();
});

function start() {
  if (config.START_SEQ_NUM) {
    redis.get('match_seq_num', (err, result) => {
      if (err || !result) {
        console.log('failed to get match_seq_num from redis, waiting to retry');
        return setTimeout(start, 10000);
      }
      // stagger
      result = Number(result);
      scanApi(result);
    });
  } else if (config.NODE_ENV !== 'production') {
    // never do this in production to avoid skipping sequence number if we didn't pull .env properly
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

  function scanApi(seq_num) {
    // set local vars
    const arr = [];
    const matchBuffer = {};
    const completePages = {};
    for (let i = 0; i < parallelism; i++) {
      arr.push(seq_num + i * PAGE_SIZE);
    }
    const next_seq_num = seq_num;
    // async parallel calls
    async.each(arr, processPage, finishPageSet);

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
        if (resp.length >= PAGE_SIZE) {
          completePages[arr.indexOf(match_seq_num)] = Math.max(next_seq_num, resp[PAGE_SIZE - 1].match_seq_num + 1);
        }
        console.log('[API] match_seq_num:%s, matches:%s', match_seq_num, resp.length);
        async.each(resp, processMatch, cb);
      });
    }

    function processMatch(match, cb) {
      // In development environment, only insert a fraction of matches to avoid overload
      if (config.NODE_ENV === 'development' && (match.match_id % 100) >= Number(config.SCANNER_PERCENT)) {
        return finishMatch();
      }
      // check if match was previously processed
      redis.get(`scanner_insert:${match.match_id}`, (err, result) => {
        if (err) {
          return finishMatch(err);
        }
        // don't insert this match if we already processed it recently
        // deduplicate matches in this page set
        if (!result && !matchBuffer[match.match_id]) {
          matchBuffer[match.match_id] = 1;
          insertMatch(db, redis, match, {
            type: 'api',
            origin: 'scanner',
            cassandra,
          }, (err) => {
            if (!err) {
              // mark with long-lived key to indicate complete (persist between restarts)
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
          console.error(err);
        }
        return cb(err);
      }
    }

    function finishPageSet(err) {
      if (err) {
        // something bad happened, retry this page
        console.error(err);
        return scanApi(seq_num);
      } else {
        // find next seq num by last contiguous seq num (completed page)
        let next_seq_num = seq_num;
        for (let i = 0; i < parallelism; i++) {
          if (!completePages[i]) {
            break;
          }
          next_seq_num = completePages[i];
        }
        console.log('next_seq_num: %s', next_seq_num);
        redis.set('match_seq_num', next_seq_num);
        // completed inserting matches on this page
        // if page set isn't full, delay the next iteration
        return setTimeout(() => {
          return scanApi(next_seq_num);
        }, Object.keys(matchBuffer).length < (parallelism * PAGE_SIZE) ? 3000 : 0);
      }
    }
  }
}
