const constants = require('dotaconstants');
const express = require('express');
const mmstats = express.Router();
const async = require('async');
module.exports = function (redis) {
  const pageCalls = createCalls(-1);
  const apiCalls = createCalls(0);
  mmstats.route('/mmstats').get((req, res, next) => {
    async.parallel(pageCalls, (err, result) => {
      if (err) return next(err);
      res.render('mmstats', {
        result,
      });
    });
  });
  mmstats.route('/mmstats/api').get((req, res, next) => {
    async.parallel(apiCalls, (err, result) => {
      if (err) return next(err);
      res.json(result);
    });
  });
  return mmstats;

  function createCalls(range) {
    const calls = {};
    for (let i = 0; i < Object.keys(constants.regions).length; i++) {
      let regionName;
      for (const region in constants.regions) {
        if (constants.regions[region].matchgroup === i + '') {
          regionName = region;
          break;
        }
      }
      calls[regionName ? regionName : i] = createCall(i, range);
    }
    calls.x = function (cb) {
      redis.lrange('mmstats:time', 0, range, cb);
    };
    return calls;
  }

  function createCall(i, range) {
    return function (cb) {
      redis.lrange('mmstats:' + i, 0, range, cb);
    };
  }
};
