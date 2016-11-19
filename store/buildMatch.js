/**
 * Functions to build/cache match object
 **/
const config = require('../config');
const async = require('async');
const queries = require('./queries');
const compute = require('../util/compute');
const utility = require('../util/utility');
const constants = require('dotaconstants');

const computeMatchData = compute.computeMatchData;
const deserialize = utility.deserialize;
const buildReplayUrl = utility.buildReplayUrl;

function getMatch(matchId, options, cb) {
  const cassandra = options.cassandra;
  const redis = options.redis;
  const db = options.db;

  function getMatchData(matchId, cb) {
    if (cassandra) {
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
    } else {
      db.first(['matches.match_id', 'match_skill.skill', 'radiant_win', 'start_time', 'duration', 'tower_status_dire', 'tower_status_radiant', 'barracks_status_dire', 'barracks_status_radiant', 'cluster', 'lobby_type', 'leagueid', 'game_mode', 'picks_bans', 'chat', 'teamfights', 'objectives', 'radiant_gold_adv', 'radiant_xp_adv', 'version'])
        .from('matches')
        .leftJoin('match_skill', 'matches.match_id', 'match_skill.match_id')
        .where({
          'matches.match_id': Number(matchId),
        })
        .asCallback(cb);
    }
  }

  function getPlayerMatchData(matchId, cb) {
    if (cassandra) {
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
    } else {
      db.select(['personaname', 'last_login', 'player_matches.match_id', 'player_matches.account_id', 'player_slot', 'hero_id', 'item_0', 'item_1', 'item_2', 'item_3', 'item_4', 'item_5', 'kills', 'deaths', 'assists', 'leaver_status', 'gold', 'last_hits', 'denies', 'gold_per_min', 'xp_per_min', 'gold_spent', 'hero_damage', 'tower_damage', 'hero_healing', 'level', 'additional_units', 'stuns', 'max_hero_hit', 'times', 'gold_t', 'lh_t', 'dn_t', 'xp_t', 'obs_log', 'sen_log', 'purchase_log', 'kills_log', 'buyback_log', 'lane_pos', 'obs', 'sen', 'actions', 'pings', 'purchase', 'gold_reasons', 'xp_reasons', 'killed', 'item_uses', 'ability_uses', 'hero_hits', 'damage', 'damage_taken', 'damage_inflictor', 'runes', 'killed_by', 'kill_streaks', 'multi_kills', 'life_state'])
        .from('player_matches')
        .where({
          'player_matches.match_id': Number(matchId),
        })
        .leftJoin('players', 'player_matches.account_id', 'players.account_id')
        .orderBy('player_slot', 'asc')
        .asCallback(cb);
    }
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
      prodata(cb) {
        db.first(['radiant_team_id', 'dire_team_id', 'leagueid'])
          .from('matches')
          .where({
            match_id: matchId,
          }).asCallback((err, result) => {
            if (err) {
              return cb(err);
            }
            if (!result) {
              return cb(null, {});
            }
            return async.parallel({
              league: cb => db.first().from('leagues').where({
                leagueid: result.leagueid,
              }).asCallback(cb),
              radiant_team: cb => db.first().from('teams').where({
                team_id: result.radiant_team_id,
              }).asCallback(cb),
              dire_team: cb => db.first().from('teams').where({
                team_id: result.dire_team_id,
              }).asCallback(cb),
            }, cb);
          });
      },
    }, (err, result) => {
      if (err) {
        return cb(err);
      }
      match = Object.assign({}, match, result.gcdata, result.skill, result.prodata, {
        players: result.players,
      });
      // Assign cosmetics to each player
      if (result.cosmetics) {
        match.players.forEach((p) => {
          const hero = constants.heroes[p.hero_id] || {};
          p.cosmetics = result.cosmetics.filter(c => match.cosmetics[c.item_id] === p.player_slot &&
            (!c.used_by_heroes || c.used_by_heroes === hero.name));
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

function buildMatch(matchId, options, cb) {
  const redis = options.redis;
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
    return getMatch(matchId, options, (err, match) => {
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
