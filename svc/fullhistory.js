/**
 * Worker to fetch full match histories for players
 * */
const async = require('async');
const urllib = require('url');
const constants = require('dotaconstants');
const config = require('../config');
const { redisCount, getData, generateJob } = require('../util/utility');
const db = require('../store/db');
const redis = require('../store/redis');
const queue = require('../store/queue');
const queries = require('../store/queries');

const { insertMatch } = queries;
const apiKeys = config.STEAM_API_KEY.split(',');
// number of api requests to send at once
const parallelism = Math.min(20, apiKeys.length);

function processFullHistory(job, cb) {
  function updatePlayer(player, cb) {
    // done with this player, update
    db('players').update({
      full_history_time: new Date(),
      fh_unavailable: player.fh_unavailable,
    }).where({
      account_id: player.account_id,
    }).asCallback((err) => {
      if (err) {
        return cb(err);
      }
      console.log('got full match history for %s', player.account_id);
      redisCount(redis, 'fullhistory');
      return cb(err);
    });
  }

  function getApiMatchPage(player, url, cb) {
    getData(url, (err, body) => {
      if (err) {
        // non-retryable error, probably the user's account is private
        console.log('non-retryable error');
        return cb(err);
      }
      // if !body.result, try again
      if (!body.result) {
        return getApiMatchPage(player, url, cb);
      }
      // response for match history for single player
      const resp = body.result.matches;
      let startId = 0;
      resp.forEach((match) => {
        // add match ids on each page to match_ids
        const matchId = match.match_id;
        player.match_ids[matchId] = true;
        startId = match.match_id;
      });
      const rem = body.result.results_remaining;
      if (rem === 0) {
        // no more pages
        return cb(err);
      }
      // paginate through to max 500 games if necessary with start_at_match_id=
      const parse = urllib.parse(url, true);
      parse.query.start_at_match_id = (startId - 1);
      parse.search = null;
      url = urllib.format(parse);
      return getApiMatchPage(player, url, cb);
    });
  }

  const player = job;
  if (Number(player.account_id) === 0) {
    return cb();
  }
  // if test or only want 500 of any hero, use the short array
  const heroArray = job.short_history || config.NODE_ENV === 'test' ? ['0'] : Object.keys(constants.heroes);
  // use steamapi via specific player history and specific hero id (up to 500 games per hero)
  player.match_ids = {};
  return async.eachLimit(heroArray, parallelism, (heroId, cb) => {
    // make a request for every possible hero
    const container = generateJob('api_history', {
      account_id: player.account_id,
      hero_id: heroId,
      matches_requested: 100,
    });
    getApiMatchPage(player, container.url, (err) => {
      console.log('%s matches found', Object.keys(player.match_ids).length);
      cb(err);
    });
  }, (err) => {
    player.fh_unavailable = Boolean(err);
    if (err) {
      // non-retryable error while scanning, user had a private account
      console.log('error: %s', JSON.stringify(err));
      updatePlayer(player, cb);
    } else {
      // check what matches the player is already associated with
      queries.getPlayerMatches(player.account_id, {
        project: ['match_id'],
      }, (err, docs) => {
        if (err) {
          return cb(err);
        }
        console.log('%s matches found, %s already in db, %s to add', Object.keys(player.match_ids).length, docs.length, Object.keys(player.match_ids).length - docs.length);
        // iterate through db results, delete match_id key if this player has this match already
        // will re-request and update matches where this player was previously anonymous
        for (let i = 0; i < docs.length; i += 1) {
          const matchId = docs[i].match_id;
          delete player.match_ids[matchId];
        }
        // iterate through keys, make api_details requests
        return async.eachLimit(Object.keys(player.match_ids), parallelism, (matchId, cb) => {
          // process api jobs directly with parallelism
          const container = generateJob('api_details', {
            match_id: Number(matchId),
          });
          getData(container.url, (err, body) => {
            if (err) {
              return cb(err);
            }
            const match = body.result;
            return insertMatch(match, {
              type: 'api',
              skipParse: true,
            }, cb);
          });
        }, (err) => {
          if (err) {
            return cb(err);
          }
          return updatePlayer(player, cb);
        });
      });
    }
  });
}

queue.runQueue('fhQueue', 1, processFullHistory);
