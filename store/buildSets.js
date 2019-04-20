/**
 * Function to build/cache sets of players
 * */
const async = require('async');
const moment = require('moment');
const request = require('request');
const config = require('../config');

module.exports = function buildSets(db, redis, cb) {
  console.log('rebuilding sets');
  async.parallel({
    // users in this set are added to the trackedPlayers set
    donators(cb) {
      db.select(['account_id']).from('players').where('cheese', '>', 0).asCallback((err, docs) => {
        if (err) {
          return cb(err);
        }
        docs.forEach((player) => {
          // Refresh donators with expire date in the future
          redis.zadd('tracked', moment().add(1, 'month').format('X'), player.account_id);
        });
        return cb(err);
      });
    },
    // Additional users to track from a URL
    tracked_account_url(cb) {
      if (!config.TRACKED_ACCOUNT_URL) {
        return cb();
      }
      return request.get({ url: config.TRACKED_ACCOUNT_URL, json: true }, (err, resp, body) => {
        if (err) {
          return cb(err);
        }
        if (body && body.data && body.data.account_ids) {
          body.data.account_ids.forEach((id) => {
            console.log(id);
            // Refresh with expire date in one day
            redis.zadd('tracked', moment().add(1, 'day').format('X'), id);
          });
        }
        return cb();
      });
    },
  }, (err) => {
    if (err) {
      console.log('error occurred during buildSets: %s', err);
      return cb(err);
    }
    // Remove inactive players from tracked set
    redis.zremrangebyscore('tracked', 0, moment().format('X'));
    return cb(err);
  });
};
