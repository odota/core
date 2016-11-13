/**
 * Function to build status data
 **/
// const config = require('../config');
const queue = require('./queue');
const async = require('async');
const moment = require('moment');

module.exports = function buildStatus(db, redis, cb) {
  function generatePercentiles(arr) {
    // sort the list
    arr.sort((a, b) => Number(a) - Number(b));
    // console.log(arr);
    const percentiles = [50, 75, 95, 99];
    const result = {};
    arr.forEach((time, i) => {
      if (i >= arr.length * (percentiles[0] / 100)) {
        result[percentiles[0]] = Number(time);
        // Pop the first element
        percentiles.shift();
      }
    });
    return result;
  }
  redis.zremrangebyscore('added_match', 0, moment().subtract(1, 'day').format('X'));
  redis.zremrangebyscore('error_500', 0, moment().subtract(1, 'day').format('X'));
  redis.zremrangebyscore('api_hits', 0, moment().subtract(1, 'day').format('X'));
  redis.zremrangebyscore('parser', 0, moment().subtract(1, 'day').format('X'));
  redis.zremrangebyscore('retriever', 0, moment().subtract(1, 'day').format('X'));
  redis.zremrangebyscore('visitor_match', 0, moment().subtract(1, 'day').format('X'));
  redis.zremrangebyscore('requests', 0, moment().subtract(1, 'day').format('X'));
  async.series({
    user_players(cb) {
      redis.zcard('visitors', cb);
    },
    tracked_players(cb) {
      redis.zcard('tracked', cb);
    },
    error_500(cb) {
      redis.zcard('error_500', cb);
    },
    matches_last_day(cb) {
      redis.zcard('added_match', cb);
    },
    matches_last_hour(cb) {
      redis.zcount('added_match', moment().subtract(1, 'hour').format('X'), moment().format('X'), cb);
    },
    user_matches_last_day(cb) {
      redis.zcard('visitor_match', cb);
    },
    retriever_matches_last_day(cb) {
      redis.zcard('retriever', cb);
    },
    parsed_matches_last_day(cb) {
      redis.zcard('parser', cb);
    },
    requests_last_day(cb) {
      redis.zcard('requests', cb);
    },
    fhQueue(cb) {
      redis.llen('fhQueue', cb);
    },
    gcQueue(cb) {
      redis.llen('gcQueue', cb);
    },
    mmrQueue(cb) {
      redis.llen('mmrQueue', cb);
    },
    api_hits(cb) {
      redis.zcard('api_hits', cb);
    },
    last_added(cb) {
      redis.lrange('matches_last_added', 0, -1, (err, result) =>
        cb(err, result.map(r =>
          JSON.parse(r)
        ))
      );
    },
    last_parsed(cb) {
      redis.lrange('matches_last_parsed', 0, -1, (err, result) =>
        cb(err, result.map(r =>
          JSON.parse(r)
        ))
      );
    },
    retriever(cb) {
      redis.zrangebyscore('retriever', moment().subtract(1, 'hour').format('X'), moment().format('X'), (err, results) => {
        if (err) {
          return cb(err);
        }
        const counts = {};
        results.forEach((e) => {
          const key = e.split('_')[0];
          counts[key] = counts[key] ? counts[key] + 1 : 1;
        });
        const result = Object.keys(counts).map(retriever => ({
          hostname: retriever.split('.')[0],
          count: counts[retriever],
        })).sort((a, b) => a.hostname.localeCompare(b.hostname));
        return cb(err, result);
      });
    },
    queue(cb) {
      // generate object with properties as queue types, each mapped to json object mapping state to count
      queue.getCounts(redis, cb);
    },
    load_times(cb) {
      redis.lrange('load_times', 0, -1, (err, arr) => {
        cb(err, generatePercentiles(arr));
      });
    },
    health(cb) {
      redis.hgetall('health', (err, result) => {
        if (err) {
          return cb(err);
        }
        const response = result || {};
        Object.keys(response).forEach((key) => {
          response[key] = JSON.parse(response[key]);
        });
        return cb(err, response);
      });
    },
  }, (err, results) => {
    cb(err, results);
  });
};
