/**
 * Functions to build/cache match object
 **/
const config = require('../config');
const async = require('async');
const queries = require('./queries');
const compute = require('../util/compute');
const utility = require('../util/utility');
const constants = require('dotaconstants');
const cassandra = require('../store/cassandra');
const redis = require('../store/redis');
const db = require('../store/db');

const computeMatchData = compute.computeMatchData;
const deserialize = utility.deserialize;
const buildReplayUrl = utility.buildReplayUrl;

function getMatch(matchId, cb) {
  function getMatchData(matchId, cb) {
    cassandra.execute('SELECT * FROM matches where match_id = ?', [Number(matchId)], {
      prepare: true,
      fetchSize: 10,
      autoPage: true,
    }, (err, result) => {
      if (err) {
        return cb(err);
      }
      result = result.rows.map(m =>
        deserialize(m)
      );
      return cb(err, result[0]);
    });
  }

  function getPlayerMatchData(matchId, cb) {
    cassandra.execute('SELECT * FROM player_matches where match_id = ?', [Number(matchId)], {
      prepare: true,
      fetchSize: 10,
      autoPage: true,
    }, (err, result) => {
      if (err) {
        return cb(err);
      }
      result = result.rows.map(m =>
        deserialize(m)
      );
      // get personanames
      return async.map(result, (r, cb) => {
        db.raw(`
          SELECT personaname, name, last_login 
          FROM players
          LEFT JOIN notable_players
          ON players.account_id = notable_players.account_id
          WHERE players.account_id = ?
        `, [r.account_id]).asCallback((err, names) => {
          if (err) {
            return cb(err);
          }
          return cb(err, Object.assign({}, r, names.rows[0]));
        });
      }, cb);
    });
  }

  getMatchData(matchId, (err, match) => {
    if (err) {
      return cb(err);
    } else if (!match) {
      return cb();
    }
    return async.parallel({
      players(cb) {
        getPlayerMatchData(matchId, (err, players) => {
          if (err) {
            return cb(err);
          }
          return async.map(players, (p, cb) => {
            // match-level columns
            p.radiant_win = match.radiant_win;
            p.start_time = match.start_time;
            p.duration = match.duration;
            p.cluster = match.cluster;
            p.lobby_type = match.lobby_type;
            p.game_mode = match.game_mode;
            computeMatchData(p);
            redis.zscore('solo_competitive_rank', p.account_id || '', (err, rating) => {
              p.solo_competitive_rank = rating;
              return cb(err, p);
            });
          }, cb);
        });
      },
      gcdata(cb) {
        db.first().from('match_gcdata').where({
          match_id: matchId,
        }).asCallback(cb);
      },
      skill(cb) {
        db.first().from('match_skill').where({
          match_id: matchId,
        }).asCallback(cb);
      },
      cosmetics(cb) {
        async.map(Object.keys(match.cosmetics || {}), (itemId, cb) => {
          db.first().from('cosmetics').where({
            item_id: itemId,
          }).asCallback(cb);
        }, (err, cosmetics) => {
          if (err) {
            return cb(err);
          }
          return cb(err, cosmetics.filter(c => c));
        });
      },
    }, (err, result) => {
      if (err) {
        return cb(err);
      }
      match = Object.assign({}, match, result.gcdata, result.skill, {
        players: result.players,
      });
      // Assign cosmetics to each player
      if (result.cosmetics) {
        match.players.forEach((p) => {
          const hero = constants.heroes[p.hero_id] || {};
          p.cosmetics = result.cosmetics.filter(c => match.cosmetics[c.item_id] === p.player_slot
            && (!c.used_by_heroes || c.used_by_heroes === hero.name));
        });
      }
      computeMatchData(match);
      if (match.replay_salt) {
        match.replay_url = buildReplayUrl(match.match_id, match.cluster, match.replay_salt);
      }
      return queries.getMatchBenchmarks(redis, match, err =>
        cb(err, match)
      );
    });
  });
}

function buildMatch(matchId, cb) {
  const key = `match:${matchId}`;
  redis.get(key, (err, reply) => {
    if (err) {
      return cb(err);
    } else if (reply) {
      console.log(`Cache hit for match ${matchId}`);
      const match = JSON.parse(reply);
      return cb(err, match);
    }
    console.log(`Cache miss for match ${matchId}`);
    return getMatch(matchId, (err, match) => {
      if (err) {
        return cb(err);
      }
      if (!match) {
        return cb();
      }
      if (match.version && config.ENABLE_MATCH_CACHE) {
        redis.setex(key, 1800, JSON.stringify(match));
      }
      return cb(err, match);
    });
  });
}

module.exports = buildMatch;
