/**
 * Function to build status data
 * */
// const config = require('../config');
const queue = require('./queue');
const async = require('async');
const utility = require('../util/utility');

module.exports = function buildStatus(db, redis, cb) {
  function generatePercentiles(arr) {
    // sort the list
    arr.sort((a, b) => Number(a) - Number(b));
    // console.log(arr);
    const percentiles = [50, 75, 90, 95, 99];
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
  async.series({
    user_players(cb) {
      redis.zcard('visitors', cb);
    },
    tracked_players(cb) {
      redis.zcard('tracked', cb);
    },
    matches_last_day(cb) {
      utility.getRedisCountDay(redis, 'added_match', cb);
    },
    matches_last_hour(cb) {
      utility.getRedisCountHour(redis, 'added_match', cb);
    },
    retriever_matches_last_day(cb) {
      utility.getRedisCountDay(redis, 'retriever', cb);
    },
    parsed_matches_last_day(cb) {
      utility.getRedisCountDay(redis, 'parser', cb);
    },
    requests_last_day(cb) {
      utility.getRedisCountDay(redis, 'request', cb);
    },
    api_hits_last_day(cb) {
      utility.getRedisCountDay(redis, 'api_hits', cb);
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
    retriever(cb) {
      redis.zrangebyscore('retrieverCounts', '-inf', 'inf', 'WITHSCORES', (err, results) => {
        if (err) {
          return cb(err);
        }
        const response = [];
        results.forEach((result, i) => {
          if (i % 2 === 0) {
            response.push({
              hostname: result.split('.')[0],
              count: results[i + 1],
            });
          }
        });
        return cb(err, response);
      });
    },
    last_added(cb) {
      redis.lrange('matches_last_added', 0, -1, (err, result) =>
        cb(err, result.map(r =>
          JSON.parse(r),
        )),
      );
    },
    last_parsed(cb) {
      redis.lrange('matches_last_parsed', 0, -1, (err, result) =>
        cb(err, result.map(r =>
          JSON.parse(r),
        )),
      );
    },
    queue(cb) {
      // generate object with properties as queue types
      // each mapped to json object mapping state to count
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
