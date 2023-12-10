import constants from 'dotaconstants';
import fs from 'fs';
import config from '../config.js';
import { computeMatchData } from '../util/compute';
import {
  generateJob,
  getDataPromise,
  buildReplayUrl,
  isContributor,
  redisCount,
} from '../util/utility';
import redis from './redis';
import db from './db';
import {
  getMatchData,
  insertMatchPromise,
  getMatchBenchmarks,
  getPlayerMatchData,
} from './queries';
import { getMeta } from './getMeta';

async function extendPlayerData(player: ParsedPlayer, match: ParsedMatch) {
  // NOTE: This adds match specific properties into the player object, which leads to some unnecessary duplication in the output
  const p = {
    ...player,
    radiant_win: match.radiant_win,
    start_time: match.start_time,
    duration: match.duration,
    cluster: match.cluster,
    lobby_type: match.lobby_type,
    game_mode: match.game_mode,
    is_contributor: player.account_id && isContributor(player.account_id),
  };
  computeMatchData(p as unknown as ParsedPlayerMatch);
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
async function prodataInfo(matchId: string) {
  const result = await db
    .first([
      'radiant_team_id',
      'dire_team_id',
      'leagueid',
      'series_id',
      'series_type',
    ])
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

async function backfill(matchId: string) {
  const matchObj = {
    match_id: Number(matchId),
  };
  const body = await getDataPromise(generateJob('api_details', matchObj).url);
  // match details response
  const match = body.result;
  await insertMatchPromise(match, {
    type: 'api',
    skipParse: true,
  });
  // Count for logging
  redisCount(redis, 'steam_api_backfill');
}
async function doBuildMatch(
  matchId: string,
  options: { source?: MatchStorage; meta?: string }
) {
  if (!matchId || Number.isNaN(Number(matchId)) || Number(matchId) <= 0) {
    return null;
  }
  // check if the match is archived
  // the blobstore may have the match but missing gcdata/parse if it was backfilled after deletion
  // Also most matches won't be in the archive so it's more efficient not to always try
  const isArchived = Boolean(
    (
      await db.raw(
        'select match_id from parsed_matches where match_id = ? and is_archived IS TRUE',
        [matchId]
      )
    ).rows[0]
  );
  let match: ParsedMatch | null = null;
  if (isArchived || options.source === 'archive') {
    match = await getMatchData(matchId, 'archive');
    if (match) {
      match.od_storage = 'archive';
    }
  }
  if (!match || options.source === 'cassandra') {
    // Fetch from legacy
    match = await getMatchData(matchId, 'cassandra');
    if (match) {
      match.od_storage = 'cassandra';
    }
  }
  if (!match || options.source === 'blob') {
    // Fetch from blobstore
    // TODO (howard) want to make this primary, but we have to archive old parsed matches first, otherwise we may show unparsed data even if parsed
    match = await getMatchData(matchId, 'blob');
    if (match) {
      match.od_storage = 'blob';
    }
  }
  if (!match) {
    // if we still don't have it, try backfilling it from Steam API and then check again
    // Once backfilled it'll be in blobstore
    await backfill(matchId);
    match = await getMatchData(matchId, 'blob');
    if (match) {
      match.od_storage = 'backfill_blob';
    }
  }
  if (!match) {
    // Still don't have it
    return null;
  }
  redisCount(redis, 'build_match');
  let playersMatchData: ParsedPlayer[] = [];
  // TODO (howard) remove this backfill once matches/player_matches deleted
  playersMatchData = match.players || (await getPlayerMatchData(matchId));
  if (playersMatchData.length === 0) {
    await backfill(matchId);
    playersMatchData = await getPlayerMatchData(matchId);
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
          [r.account_id ?? null]
        )
        .then((names) => ({ ...r, ...names.rows[0] }))
    )
  );
  const playersPromise = Promise.all(
    playersMatchData.map((p) => extendPlayerData(p, match as ParsedMatch))
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
  const metadataPromise = Boolean(options.meta)
    ? getMeta(matchId)
    : Promise.resolve(null);
  const [players, gcdata, prodata, cosmetics, metadata] = await Promise.all([
    playersPromise,
    gcdataPromise,
    prodataPromise,
    cosmeticsPromise,
    metadataPromise,
  ]);
  let matchResult = {
    ...match,
    ...gcdata,
    ...prodata,
    metadata,
    players,
  };
  if (cosmetics) {
    const playersWithCosmetics = matchResult.players.map((p: ParsedPlayer) => {
      const hero = constants.heroes[p.hero_id] || {};
      const playerCosmetics = cosmetics
        .filter(Boolean)
        .filter(
          (c) =>
            match?.cosmetics[c.item_id] === p.player_slot &&
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
  const playersWithBenchmarks = await getMatchBenchmarks(matchResult);
  matchResult = {
    ...matchResult,
    players: playersWithBenchmarks,
  };
  return Promise.resolve(matchResult);
}

async function buildMatch(
  matchId: string,
  options: { source?: MatchStorage; meta?: string }
) {
  const key = `match:${matchId}`;
  const reply = await redis.get(key);
  if (reply) {
    return JSON.parse(reply);
  }
  const match = await doBuildMatch(matchId, options);
  if (match && match.version && config.ENABLE_MATCH_CACHE) {
    await redis.setex(key, config.MATCH_CACHE_SECONDS, JSON.stringify(match));
  }
  return match;
}
export default buildMatch;
