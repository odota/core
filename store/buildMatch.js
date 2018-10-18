/**
 * Functions to build/cache match object
 * */
const config = require('../config');
const async = require('async');
const queries = require('./queries');
const compute = require('../util/compute');
const utility = require('../util/utility');
const constants = require('dotaconstants');
const cassandra = require('../store/cassandra');
const redis = require('../store/redis');
const db = require('../store/db');
const { promisify } = require('util');

const { computeMatchData } = compute;
const { deserialize, buildReplayUrl, isContributor } = utility;
const getRedisAsync = promisify(redis.get).bind(redis);

// function getMatchData(matchId, cb) {
//   cassandra.execute('SELECT * FROM matches where match_id = ?', [Number(matchId)], {
//     prepare: true,
//     fetchSize: 1,
//     autoPage: true,
//   }, (err, result) => {
//     if (err) {
//       return cb(err);
//     }
//     result = result.rows.map(m => deserialize(m));
//     return cb(err, result[0]);
//   });
// }

async function getMatchData(matchId) {
  const result = await cassandra.execute('SELECT * FROM matches where match_id = ?', [Number(matchId)], {
    prepare: true,
    fetchSize: 1,
    autoPage: true,
  });
  const deserializedResult = result.rows.map(m => deserialize(m));
  return Promise.resolve(deserializedResult[0]);
}


// function getPlayerMatchData(matchId, cb) {
//   cassandra.execute('SELECT * FROM player_matches where match_id = ?', [Number(matchId)], {
//     prepare: true,
//     fetchSize: 24,
//     autoPage: true,
//   }, (err, result) => {
//     if (err) {
//       return cb(err);
//     }
//     result = result.rows.map(m => deserialize(m));
//     // get personanames
//     return async.map(result, (r, cb) => {
//       db.raw(`
//         SELECT personaname, name, last_login
//         FROM players
//         LEFT JOIN notable_players
//         ON players.account_id = notable_players.account_id
//         WHERE players.account_id = ?
//       `, [r.account_id]).asCallback((err, names) => {
//         if (err) {
//           return cb(err);
//         }
//         return cb(err, Object.assign({}, r, names.rows[0]));
//       });
//     }, cb);
//   });
// }

async function getPlayerMatchData(matchId) {
  const result = await cassandra.execute('SELECT * FROM player_matches where match_id = ?', [Number(matchId)], {
    prepare: true,
    fetchSize: 24,
    autoPage: true,
  });
  const serializedResult = result.rows.map(m => deserialize(m));
  return Promise.all(serializedResult.map(r => db.raw(`
        SELECT personaname, name, last_login 
        FROM players
        LEFT JOIN notable_players
        ON players.account_id = notable_players.account_id
        WHERE players.account_id = ?
      `, [r.account_id])));
}

// function getMatch(matchId, cb) {
//   if (!matchId || Number.isNaN(Number(matchId)) || Number(matchId) <= 0) {
//     return cb();
//   }

//   return getMatchData(matchId, (err, match) => {
//     if (err) {
//       return cb(err);
//     } else if (!match) {
//       return cb();
//     }
//     const players = await getPlayerMatchData(matchId);
//     return Promise.all(players.map((p) => {
//       p.radiant_win = match.radiant_win;
//       p.start_time = match.start_time;
//       p.duration = match.duration;
//       p.cluster = match.cluster;
//       p.lobby_type = match.lobby_type;
//       p.game_mode = match.game_mode;
//       p.is_contributor = isContributor(p.account_id);
//       computeMatchData(p);
//       const row = db.first().from('rank_tier').where({ account_id: p.account_id || null });
//       p.rank_tier = row ? row.rating : null;

//     }));
//     return async.parallel({
//       players(cb) {
//         const players = await getPlayerMatchData(matchId);

//         getPlayerMatchData(matchId, (err, players) => {
//           if (err) {
//             return cb(err);
//           }
//           return async.map(players, (p, cb) => {
//             // match-level columns
//             p.radiant_win = match.radiant_win;
//             p.start_time = match.start_time;
//             p.duration = match.duration;
//             p.cluster = match.cluster;
//             p.lobby_type = match.lobby_type;
//             p.game_mode = match.game_mode;
//             p.is_contributor = isContributor(p.account_id);
//             computeMatchData(p);
//             db.first().from('rank_tier').where({ account_id: p.account_id || null }).asCallback((err, row) => {
//               p.rank_tier = row ? row.rating : null;
//               cb(err, p);
//             });
//           }, cb);
//         });
//       },
//       gcdata(cb) {
//         db.first().from('match_gcdata').where({
//           match_id: matchId,
//         }).asCallback(cb);
//       },
//       cosmetics(cb) {
//         async.map(Object.keys(match.cosmetics || {}), (itemId, cb) => {
//           db.first().from('cosmetics').where({
//             item_id: itemId,
//           }).asCallback(cb);
//         }, (err, cosmetics) => {
//           if (err) {
//             return cb(err);
//           }
//           return cb(err, cosmetics.filter(c => c));
//         });
//       },
//       prodata(cb) {
//         db.first(['radiant_team_id', 'dire_team_id', 'leagueid'])
//           .from('matches')
//           .where({
//             match_id: matchId,
//           }).asCallback((err, result) => {
//             if (err) {
//               return cb(err);
//             }
//             if (!result) {
//               return cb(null, {});
//             }
//             return async.parallel({
//               league: cb => db.first().from('leagues').where({
//                 leagueid: result.leagueid,
//               }).asCallback(cb),
//               radiant_team: cb => db.first().from('teams').where({
//                 team_id: result.radiant_team_id,
//               }).asCallback(cb),
//               dire_team: cb => db.first().from('teams').where({
//                 team_id: result.dire_team_id,
//               }).asCallback(cb),
//             }, cb);
//           });
//       },
//     }, (err, result) => {
//       if (err) {
//         return cb(err);
//       }
//       match = Object.assign({}, match, result.gcdata, result.prodata, {
//         players: result.players,
//       });
//       // Assign cosmetics to each player
//       if (result.cosmetics) {
//         match.players.forEach((p) => {
//           const hero = constants.heroes[p.hero_id] || {};
//           p.cosmetics = result.cosmetics.filter(c => match.cosmetics[c.item_id] === p.player_slot &&
//             (!c.used_by_heroes || c.used_by_heroes === hero.name));
//         });
//       }
//       computeMatchData(match);
//       if (match.replay_salt) {
//         match.replay_url = buildReplayUrl(match.match_id, match.cluster, match.replay_salt);
//       }
//       return queries.getMatchBenchmarks(match, err => cb(err, match));
//     });
//   });
// }

async function extendPlayerData(player, match) {
  const p = {
    ...player,
    radiant_win: match.radiant_win,
    start_time: match.start_time,
    duration: match.duration,
    cluster: match.cluster,
    lobby_type: match.lobby_type,
    game_mode: match.game_mode,
    is_contributor: isContributor(player.account_id),
  };
  computeMatchData(p);
  const row = await db.first().from('rank_tier').where({ account_id: p.account_id || null });
  p.rank_tier = row ? row.rating : null;
  return Promise.resolve(p);
}

async function prodataInfo(matchId) {
  const result = await db.first(['radiant_team_id', 'dire_team_id', 'leagueid'])
    .from('matches')
    .where({
      match_id: matchId,
    });
  if (!result) {
    return Promise.resolve({});
  }
  const leaguePromise = db.first().from('leagues').where({
    leagueid: result.leagueid,
  });
  const radiantTeamPromise = db.first().from('teams').where({
    team_id: result.radiant_team_id,
  });
  const direTeamPromise = db.first().from('teams').where({
    team_id: result.dire_team_id,
  });
  const [league, radiant_team, dire_team] = await Promise.all([leaguePromise, radiantTeamPromise, direTeamPromise]);
  return Promise.resolve({
    league,
    radiant_team,
    dire_team,
  });
}

async function getMatch(matchId) {
  if (!matchId || Number.isNaN(Number(matchId)) || Number(matchId) <= 0) {
    return Promise.reject();
  }
  const match = await getMatchData(matchId);
  if (!match) {
    console.log('no match found');
    return Promise.reject();
  }
  const playersMatchData = await getPlayerMatchData(matchId);
  const playersPromise = Promise.all(playersMatchData.map(p => extendPlayerData(p, match)));
  const gcdataPromise = db.first().from('match_gcdata').where({
    match_id: matchId,
  });
  const cosmeticsPromise = Object.keys(match.cosmetics || {}).map(itemId => db.first().from('cosmetics').where({
    item_id: itemId,
  }));
  const prodataPromise = prodataInfo(matchId);

  const [players, gcdata, prodata, cosmetics] = await Promise.all([playersPromise, gcdataPromise, prodataPromise, cosmeticsPromise]);

  let matchResult = {
    ...match,
    ...gcdata,
    ...prodata,
    players,
  };

  if (cosmetics) {
    const playersWithCosmetics = matchResult.players.map((p) => {
      const hero = constants.heroes[p.hero_id] || {};
      const playerCosmetics = cosmetics.filter(c => match.cosmetics[c.item_id] === p.player_slot &&
        (!c.used_by_heroes || c.used_by_heroes === hero.name));
      return {
        ...p,
        cosmetics: playerCosmetics,
      };
    });
    matchResult = {
      ...matchResult,
      players: playersWithCosmetics,
    };
  }
  computeMatchData(matchResult);
  if (matchResult.replay_salt) {
    matchResult.replay_url = buildReplayUrl(matchResult.match_id, matchResult.cluster, matchResult.replay_salt);
  }
  const matchWithBenchmarks = await queries.getMatchBenchmarksPromisified(matchResult);
  return Promise.resolve(matchWithBenchmarks);
}

async function buildMatch(matchId, query) {
  const key = `match:${matchId}`;
  const reply = await getRedisAsync(key);
  if (reply) {
    return Promise.resolve(JSON.parse(reply));
  }
  const match = await getMatch(matchId);
  if (!match) {
    return Promise.reject();
  }
  if (match.version && config.ENABLE_MATCH_CACHE) {
    await redis.setex(key, config.MATCH_CACHE_SECONDS, JSON.stringify(match));
  }
  return Promise.resolve(match);
}

module.exports = buildMatch;
