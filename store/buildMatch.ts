import constants from 'dotaconstants';
import fs from 'fs';
import config from '../config';
import { computeMatchData } from '../util/compute';
import { buildReplayUrl, isContributor, redisCount } from '../util/utility';
import redis from './redis';
import db from './db';
import {
  getMatchDataFromBlobWithMetadata,
  addPlayerBenchmarks,
} from './queries';
import { getMeta } from './getMeta';

async function extendPlayerData(
  player: Player | ParsedPlayer,
  match: Match | ParsedMatch,
): Promise<Player | ParsedPlayer> {
  // NOTE: This adds match specific properties into the player object, which leads to some unnecessary duplication in the output
  const p: Partial<ParsedPlayerMatch> = {
    ...player,
    radiant_win: match.radiant_win,
    start_time: match.start_time,
    duration: match.duration,
    cluster: match.cluster,
    lobby_type: match.lobby_type,
    game_mode: match.game_mode,
    is_contributor: Boolean(
      player.account_id && isContributor(player.account_id),
    ),
  };
  computeMatchData(p as ParsedPlayerMatch);
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
  // Note: Type is bad here, we're adding properties that shouldn't be there but changing will affect external API
  return p as (Player | ParsedPlayer);
}
async function prodataInfo(matchId: number): Promise<AnyDict> {
  const result = await db
    .first([
      'radiant_team_id',
      'dire_team_id',
      'leagueid',
      'series_id',
      'series_type',
      'cluster',
      'replay_salt',
    ])
    .from('matches')
    .where({
      match_id: matchId,
    });
  if (!result) {
    return {};
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
  const final: AnyDict = {
    league,
    radiant_team: radiantTeam,
    dire_team: direTeam,
    series_id: result.series_id,
    series_type: result.series_type,
  };
  if (result.cluster) {
    final.cluster = result.cluster;
  }
  if (result.replay_salt) {
    final.replay_salt = result.replay_salt;
  }
  return final;
}

async function buildMatch(matchId: number, options: { meta?: string }): Promise<Match | ParsedMatch | null> {
  if (!matchId || !Number.isInteger(matchId) || matchId <= 0) {
    return null;
  }
  // Check for cache
  const key = `match:${matchId}`;
  const reply = await redis.get(key);
  if (reply) {
    return JSON.parse(reply);
  }

  // Attempt to fetch match and backfill what's needed
  let [match, odData]: [
    Match | ParsedMatch | null,
    GetMatchDataMetadata | null,
  ] = await getMatchDataFromBlobWithMetadata(matchId, true);
  if (!match) {
    return null;
  }
  match.od_data = odData;
  redisCount(redis, 'build_match');
  let playersMatchData: (Player | ParsedPlayer)[] = match.players;
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
          [r.account_id ?? null],
        )
        .then((names) => ({ ...r, ...names.rows[0] })),
    ),
  );
  const playersPromise = Promise.all(
    playersMatchData.map((p) => extendPlayerData(p, match!)),
  );
  const cosmeticsPromise =
    'cosmetics' in match && match.cosmetics
      ? Promise.all(
          Object.keys(match.cosmetics).map((itemId) =>
            db.first().from('cosmetics').where({
              item_id: itemId,
            }),
          ),
        )
      : Promise.resolve(null);
  const prodataPromise = prodataInfo(matchId);
  const metadataPromise = Boolean(options.meta)
    ? getMeta(Number(matchId))
    : Promise.resolve(null);
  const [players, prodata, cosmetics, metadata] = await Promise.all([
    playersPromise,
    prodataPromise,
    cosmeticsPromise,
    metadataPromise,
  ]);
  let matchResult: Match | ParsedMatch = {
    ...match,
    ...prodata,
    metadata,
    players,
  };
  if (cosmetics) {
    const playersWithCosmetics = matchResult.players.map((p) => {
      const hero = constants.heroes[p.hero_id] || {};
      const playerCosmetics = cosmetics
        .filter(Boolean)
        .filter(
          (c) =>
            match &&
            'cosmetics' in match &&
            match.cosmetics?.[c.item_id] === p.player_slot &&
            (!c.used_by_heroes || c.used_by_heroes === hero.name),
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
  computeMatchData(matchResult as ParsedPlayerMatch);
  if (matchResult.replay_salt) {
    matchResult.replay_url = buildReplayUrl(
      matchResult.match_id,
      matchResult.cluster,
      matchResult.replay_salt,
    );
  }
  await addPlayerBenchmarks(matchResult);

  // Save in cache
  if (matchResult && 'version' in matchResult && matchResult.version && config.ENABLE_MATCH_CACHE) {
    await redis.setex(key, config.MATCH_CACHE_SECONDS, JSON.stringify(matchResult));
  }
  return matchResult;
}
export default buildMatch;
