/**
 * Functions to build/cache match object
 * */
const constants = require('dotaconstants');
const { promisify } = require('util');
const config = require('../config');
const queries = require('./queries');
const compute = require('../util/compute');
const utility = require('../util/utility');
const cassandra = require('../store/cassandra');
const redis = require('../store/redis');
const db = require('../store/db');

const { computeMatchData } = compute;
const { deserialize, buildReplayUrl, isContributor } = utility;
const getRedisAsync = promisify(redis.get).bind(redis);

async function getMatchData(matchId) {
  const result = await cassandra.execute('SELECT * FROM matches where match_id = ?', [Number(matchId)], {
    prepare: true,
    fetchSize: 1,
    autoPage: true,
  });
  const deserializedResult = result.rows.map(m => deserialize(m));
  return Promise.resolve(deserializedResult[0]);
}

async function getPlayerMatchData(matchId) {
  const result = await cassandra.execute('SELECT * FROM player_matches where match_id = ?', [Number(matchId)], {
    prepare: true,
    fetchSize: 24,
    autoPage: true,
  });
  const deserializedResult = result.rows.map(m => deserialize(m));
  return Promise.all(deserializedResult.map(r => db.raw(`
        SELECT personaname, name, last_login 
        FROM players
        LEFT JOIN notable_players
        ON players.account_id = notable_players.account_id
        WHERE players.account_id = ?
      `, [r.account_id])
    .then(names => ({ ...r, ...names.rows[0] }))));
}

async function extendPlayerData(player, match) {
  const p = {
    ...player,
    radiant_win: match.radiant_win,
    start_time: match.start_time,
    duration: match.duration,
    cluster: match.cluster,
    lobby_type: match.lobby_type,
    game_mode: match.game_mode,
    hero_dotaplus_xp: (match.dotaplus || {})[player.account_id] || 0,
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
  const [league, radiantTeam, direTeam] = await Promise.all([leaguePromise, radiantTeamPromise, direTeamPromise]);
  return Promise.resolve({
    league,
    radiant_team: radiantTeam,
    dire_team: direTeam,
  });
}

async function getMatch(matchId) {
  if (!matchId || Number.isNaN(Number(matchId)) || Number(matchId) <= 0) {
    return Promise.resolve();
  }
  const match = await getMatchData(matchId);
  if (!match) {
    return Promise.resolve();
  }
  console.log(match);
  const playersMatchData = await getPlayerMatchData(matchId);
  const playersPromise = Promise.all(playersMatchData.map(p => extendPlayerData(p, match)));
  const gcdataPromise = db.first().from('match_gcdata').where({
    match_id: matchId,
  });
  const cosmeticsPromise = Promise.all(Object.keys(match.cosmetics || {}).map(itemId => db.first().from('cosmetics').where({
    item_id: itemId,
  })));
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
      const playerCosmetics = cosmetics.filter(Boolean).filter(c => match.cosmetics[c.item_id] === p.player_slot
        && (!c.used_by_heroes || c.used_by_heroes === hero.name));
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

async function buildMatch(matchId) {
  const key = `match:${matchId}`;
  const reply = await getRedisAsync(key);
  if (reply) {
    return Promise.resolve(JSON.parse(reply));
  }
  const match = await getMatch(matchId);
  if (!match) {
    return Promise.resolve();
  }
  if (match.version && config.ENABLE_MATCH_CACHE) {
    await redis.setex(key, config.MATCH_CACHE_SECONDS, JSON.stringify(match));
  }
  return Promise.resolve(match);
}

module.exports = buildMatch;
