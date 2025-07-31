import { heroes } from 'dotaconstants';
import config from '../../config';
import { computeMatchData } from './compute';
import {
  buildReplayUrl,
  getStartOfBlockMinutes,
  isContributor,
  redisCount,
  redisCountDistinct,
} from './utility';
import redis from '../store/redis';
import db from '../store/db';
import { ApiMatch } from './types';
import { parsedFetcher } from '../fetcher/getParsedData';
import { apiFetcher } from '../fetcher/getApiData';
import { gcFetcher } from '../fetcher/getGcData';
import { archivedFetcher } from '../fetcher/getArchivedData';
import { metaFetcher } from '../fetcher/getMeta';
import { benchmarks } from './benchmarksUtil';

function extendPlayerData(
  player: Player | ParsedPlayer,
  match: Match | ParsedMatch,
): Player | ParsedPlayer {
  // NOTE: This adds match specific properties into the player object, which leads to some unnecessary duplication in the output
  // We do this right now to allow computeMatchData to work properly
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
  // Note: Type is bad here, we're adding properties that shouldn't be there but changing will affect external API
  return p as Player | ParsedPlayer;
}

async function getProMatchInfo(matchId: number): Promise<{
  radiant_team?: any;
  dire_team?: any;
  league?: any;
  series_id?: number;
  series_type?: number;
  cluster?: number;
  replay_salt?: number;
}> {
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
  const final = {
    league,
    radiant_team: radiantTeam,
    dire_team: direTeam,
    series_id: result.series_id,
    series_type: result.series_type,
    cluster: result.cluster ?? undefined,
    replay_salt: result.replay_salt ?? undefined,
  };
  return final;
}

/**
 * Adds benchmark data to the players in a match
 * */
export async function addPlayerBenchmarks(m: Match) {
  return Promise.all(
    m.players.map(async (p) => {
      p.benchmarks = {};
      for (let i = 0; i < Object.keys(benchmarks).length; i++) {
        const metric = Object.keys(benchmarks)[i];
        p.benchmarks[metric] = {};
        // Use data from previous epoch
        let key = [
          'benchmarks',
          getStartOfBlockMinutes(
            Number(config.BENCHMARK_RETENTION_MINUTES),
            -1,
          ),
          metric,
          p.hero_id,
        ].join(':');
        const backupKey = [
          'benchmarks',
          getStartOfBlockMinutes(Number(config.BENCHMARK_RETENTION_MINUTES), 0),
          metric,
          p.hero_id,
        ].join(':');
        const raw = benchmarks[metric](m, p);
        p.benchmarks[metric] = {
          raw,
        };
        const exists = await redis.exists(key);
        if (exists === 0) {
          // No data, use backup key (current epoch)
          key = backupKey;
        }
        const card = await redis.zcard(key);
        if (raw !== undefined && raw !== null && !Number.isNaN(Number(raw))) {
          const count = await redis.zcount(key, '0', raw);
          const pct = count / card;
          p.benchmarks[metric].pct = pct;
        }
      }
      return p;
    }),
  );
}

export async function getMatchDataFromBlobWithMetadata(
  matchId: number,
  options?: { noArchive: boolean },
): Promise<[Match | ParsedMatch | null, GetMatchDataMetadata | null]> {
  let [api, gcdata, parsed, archived]: [
    ApiMatch | null,
    GcMatch | null,
    ParserMatch | null,
    ParsedMatch | null,
  ] = await Promise.all([
    apiFetcher.readData(matchId),
    gcFetcher.readData(matchId),
    parsedFetcher.readData(matchId),
    !options?.noArchive
      ? archivedFetcher.readData(matchId)
      : Promise.resolve(null),
  ]);

  let odData: GetMatchDataMetadata = {
    has_api: Boolean(api),
    has_gcdata: Boolean(gcdata),
    has_parsed: Boolean(parsed),
    has_archive: Boolean(archived),
  };

  if (!archived && !api) {
    // Use this event to count the number of failed requests
    // Could be due to missing data or invalid ID--need to analyze
    redisCount('steam_api_backfill');
    return [null, null];
  }

  const basePlayers = api?.players || archived?.players;
  // Merge the results together
  const final: Match | ParsedMatch = {
    ...archived,
    ...parsed,
    ...gcdata,
    ...api,
    players: basePlayers?.map((basePlayer) => {
      const apiPlayer = api?.players.find(
        (apiP) => apiP.player_slot === basePlayer.player_slot,
      );
      const archivedPlayer = archived?.players.find(
        (archivedP) => archivedP.player_slot === basePlayer.player_slot,
      );
      const gcPlayer = gcdata?.players.find(
        (gcp) => gcp.player_slot === basePlayer.player_slot,
      );
      const parsedPlayer = parsed?.players.find(
        (pp) => pp.player_slot === basePlayer.player_slot,
      );
      return {
        ...archivedPlayer,
        ...parsedPlayer,
        ...gcPlayer,
        ...apiPlayer,
      };
    }) as ParsedPlayer[],
  } as ParsedMatch;
  return [final, odData];
}

export async function buildMatch(
  matchId: number,
  options: { meta?: string },
): Promise<Match | ParsedMatch | null> {
  if (!matchId || !Number.isInteger(matchId) || matchId <= 0) {
    return null;
  }

  // track distribution of matches requested
  const bucket = Math.floor(matchId / 1000000000);
  redisCount((bucket + '_match_req') as MetricName);
  redisCount('build_match');

  // Check for cache
  const key = `match:${matchId}`;
  const reply = await redis.get(key);
  if (reply) {
    redisCount('match_cache_hit');
    return JSON.parse(reply);
  }

  // Attempt to fetch match and backfill what's needed
  let [match, odData]: [
    Match | ParsedMatch | null,
    GetMatchDataMetadata | null,
  ] = await getMatchDataFromBlobWithMetadata(matchId);
  if (!match) {
    return null;
  }
  match.od_data = odData;
  const [players, prodata, cosmetics, metadata] = await Promise.all([
    Promise.all(
      // Get names, last login for players from DB
      match.players.map(async (p) => {
        const { rows } = await db.raw(
          `
          SELECT personaname, name, last_login, rating, status
          FROM players
          LEFT JOIN notable_players USING(account_id)
          LEFT JOIN rank_tier USING(account_id)
          LEFT JOIN subscriber USING(account_id)
          WHERE players.account_id = ?
        `,
          [p.account_id ?? null],
        );
        const row = rows[0];
        return {
          ...p,
          personaname: row?.personaname,
          name: row?.name,
          last_login: row?.last_login,
          rank_tier: row?.rating,
          is_subscriber: Boolean(row?.status),
        };
      }),
    ),
    getProMatchInfo(matchId),
    'cosmetics' in match && match.cosmetics
      ? Promise.all(
          Object.keys(match.cosmetics).map((itemId) =>
            db.first().from('cosmetics').where({
              item_id: itemId,
            }),
          ),
        )
      : Promise.resolve(null),
    Boolean(options.meta)
      ? metaFetcher.getOrFetchData(Number(matchId))
      : Promise.resolve(null),
  ]);
  let matchResult: Match | ParsedMatch = {
    ...match,
    ...prodata,
    metadata,
    players: players
      .map((p) => extendPlayerData(p, match!))
      .map((p) => {
        if (!cosmetics) {
          return p;
        }
        const hero = heroes[p.hero_id as unknown as keyof typeof heroes] || {};
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
      }),
    replay_url: match.replay_salt
      ? buildReplayUrl(match.match_id, match.cluster, match.replay_salt)
      : undefined,
  };
  computeMatchData(matchResult as ParsedPlayerMatch);
  await addPlayerBenchmarks(matchResult);

  // Save in cache
  if (
    matchResult &&
    'version' in matchResult &&
    matchResult.version &&
    config.ENABLE_MATCH_CACHE
  ) {
    await redis.setex(
      key,
      config.MATCH_CACHE_SECONDS,
      JSON.stringify(matchResult),
    );
  }
  // if (config.NODE_ENV === 'development' || config.NODE_ENV === 'test') {
  //   await fs.writeFile(
  //     './json/' + matchId + '_output.json',
  //     JSON.stringify(matchResult, null, 2),
  //   );
  // }
  return matchResult;
}
