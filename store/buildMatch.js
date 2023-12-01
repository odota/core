/**
 * Functions to build/cache match object
 * */
const constants = require('dotaconstants');
const { promisify } = require('util');
const config = require('../config');
const queries = require('./queries');
const compute = require('../util/compute');
const utility = require('../util/utility');
const cassandra = require('./cassandra');
const redis = require('./redis');
const db = require('./db');
const { archiveGet } = require('./archive');
const { getPlayerMatchData, getMatchData } = require('./queries');

const { computeMatchData } = compute;
const { buildReplayUrl, isContributor } = utility;
const getRedisAsync = promisify(redis.get).bind(redis);

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
  const row = await db
    .first()
    .from('rank_tier')
    .where({ account_id: p.account_id || null });
  p.rank_tier = row ? row.rating : null;
  const subscriber = await db
    .first()
    .from('subscriber')
    .where({ account_id: p.account_id || null });
  p.is_subscriber = Boolean(subscriber?.status);
  return Promise.resolve(p);
}

async function prodataInfo(matchId) {
  const result = await db
    .first(['radiant_team_id', 'dire_team_id', 'leagueid', 'series_id', 'series_type'])
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
  const [league, radiantTeam, direTeam] = await Promise.all([
    leaguePromise,
    radiantTeamPromise,
    direTeamPromise,
  ]);
  return Promise.resolve({
    league,
    radiant_team: radiantTeam,
    dire_team: direTeam,
    series_id: result.series_id,
    series_type: result.series_type,
  });
}

async function backfill(matchId) {
  const match = {
    match_id: Number(matchId),
  };
  await new Promise((resolve, reject) => {
    utility.getData(
      utility.generateJob('api_details', match).url,
      (err, body) => {
        if (err) {
          console.error(err);
          return reject();
        }
        // match details response
        const match = body.result;
        return queries.insertMatch(
          match,
          {
            type: 'api',
            skipParse: true,
          },
          () => {
            // Count for logging
            utility.redisCount(redis, 'steam_api_backfill');
            resolve();
          }
        );
      }
    );
  });
}

async function getMatch(matchId) {
  if (!matchId || Number.isNaN(Number(matchId)) || Number(matchId) <= 0) {
    return Promise.resolve();
  }
  let match = await getMatchData(matchId);
  if (!match) {
    // check the parsed match archive to see if we have it
    const blob = await archiveGet(matchId.toString());
    if (blob) {
      match = JSON.parse(blob);
      utility.redisCount(redis, 'match_archive_read');
    }
  }
  if (!match) {
    // if we still don't have it, try backfilling it from Steam API and then check again
    await backfill(matchId);
    match = await getMatchData(matchId);
  }
  if (!match) {
    // Still don't have it
    return Promise.resolve();
  }
  utility.redisCount(redis, 'build_match');
  let playersMatchData = [];
  try {
    // If we fetched from archive we already have players
    playersMatchData = match.players || (await getPlayerMatchData(matchId));
    if (playersMatchData.length === 0) {
      // Could be due to partial deletion where we only finished deleting players
      await backfill(matchId);
      playersMatchData = await getPlayerMatchData(matchId);
    }
  } catch (e) {
    // TODO we can probably remove this try/catch after bad data is fixed
    console.error(e);
    if (
      e.message.startsWith('Unexpected') ||
      e.message.includes('Attempt to access memory outside buffer bounds')
    ) {
      utility.redisCount(redis, 'cassandra_repair');
      // Delete corrupted data and backfill
      await cassandra.execute(
        'DELETE FROM player_matches where match_id = ?',
        [Number(matchId)],
        { prepare: true }
      );
      await backfill(matchId);
      playersMatchData = await getPlayerMatchData(matchId);
    } else {
      throw e;
    }
  }
  // Get names, last login for players from DB
  playersMatchData = await Promise.all(
    playersMatchData.map((r) =>
      db
        .raw(
          `
        SELECT personaname, name, last_login 
        FROM players
        LEFT JOIN notable_players
        ON players.account_id = notable_players.account_id
        WHERE players.account_id = ?
      `,
          [r.account_id]
        )
        .then((names) => ({ ...r, ...names.rows[0] }))
    )
  );
  const playersPromise = Promise.all(
    playersMatchData.map((p) => extendPlayerData(p, match))
  );
  const gcdataPromise = db.first().from('match_gcdata').where({
    match_id: matchId,
  });
  const cosmeticsPromise = Promise.all(
    Object.keys(match.cosmetics || {}).map((itemId) =>
      db.first().from('cosmetics').where({
        item_id: itemId,
      })
    )
  );
  const prodataPromise = prodataInfo(matchId);

  const [players, gcdata, prodata, cosmetics] = await Promise.all([
    playersPromise,
    gcdataPromise,
    prodataPromise,
    cosmeticsPromise,
  ]);

  let matchResult = {
    ...match,
    ...gcdata,
    ...prodata,
    players,
  };

  if (cosmetics) {
    const playersWithCosmetics = matchResult.players.map((p) => {
      const hero = constants.heroes[p.hero_id] || {};
      const playerCosmetics = cosmetics
        .filter(Boolean)
        .filter(
          (c) =>
            match.cosmetics[c.item_id] === p.player_slot &&
            (!c.used_by_heroes || c.used_by_heroes === hero.name)
        );
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
    matchResult.replay_url = buildReplayUrl(
      matchResult.match_id,
      matchResult.cluster,
      matchResult.replay_salt
    );
  }
  const matchWithBenchmarks =
    await queries.getMatchBenchmarksPromisified(matchResult);
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
