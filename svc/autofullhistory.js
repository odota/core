/**
 * Worker to auto-queue full history requests for random players
 * */
const async = require('async');
const db = require('../store/db');
const redis = require('../store/redis');

function getSummaries(cb) {
  db.raw('SELECT account_id from players TABLESAMPLE SYSTEM_ROWS(100)').asCallback((err, result) => {
    if (err) {
      return cb(err);
    }
    console.log(result.rows);
    return async.each(result.rows, (row, cb) => {
      return redis.lpush('fhQueue', JSON.stringify({
        account_id: row.account_id,
        short_history: true,
      }), cb);
    }, cb);
  });
}

function start() {
  getSummaries((err) => {
    if (err) {
      throw err;
    }
    return setTimeout(start, 100000);
  });
}

start();
