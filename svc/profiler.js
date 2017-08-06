/**
 * Worker to fetch updated player profiles
 * */
const async = require('async');
const queries = require('../store/queries');
const db = require('../store/db');
const redis = require('../store/redis');
const utility = require('../util/utility');

const insertPlayer = queries.insertPlayer;
const getData = utility.getData;

function getSummaries(cb) {
  redis.lrange('profilerQueue', 0, -1, (err, results) => {
    if (err) {
      return cb(err);
    }
    console.log('players sampled: %s', results.length);
    const mappedResults = results.map(accountId =>
      ({
        account_id: accountId,
      }),
    );
    const container = utility.generateJob('api_summaries', {
      players: mappedResults,
    });
    return getData(container.url, (err, body) => {
      if (err) {
        // couldn't get data from api, non-retryable
        return cb(JSON.stringify(err));
      }
      // player summaries response
      return async.each(body.response.players, (player, cb) => {
        insertPlayer(db, player, cb);
      }, cb);
    });
  });
}

function start() {
  getSummaries((err) => {
    if (err) {
      throw err;
    }
    return setTimeout(start, 1000);
  });
}

start();
