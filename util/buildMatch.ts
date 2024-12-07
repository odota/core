import { heroes } from 'dotaconstants';
import config from '../config';
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
import { ApiMatch } from './pgroup';
import { ParsedFetcher } from '../fetcher/getParsedData';
import { ApiFetcher } from '../fetcher/getApiData';
import { GcdataFetcher } from '../fetcher/getGcData';
import { ArchivedFetcher } from '../fetcher/getArchivedData';
import { MetaFetcher } from '../fetcher/getMeta';
import { benchmarks } from './benchmarksUtil';

const apiFetcher = new ApiFetcher();
const gcFetcher = new GcdataFetcher();
const parsedFetcher = new ParsedFetcher();
const archivedFetcher = new ArchivedFetcher();
const metaFetcher = new MetaFetcher();

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
    .where({ account_id: p.account_id ?? null });
  p.rank_tier = row ? row.rating : null;
  const subscriber = await db
    .first()
    .from('subscriber')
    .where({ account_id: p.account_id ?? null });
  p.is_subscriber = Boolean(subscriber?.status);
  // Note: Type is bad here, we're adding properties that shouldn't be there but changing will affect external API
  return p as Player | ParsedPlayer;
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
  options?: { noArchive: boolean; noBlobStore: boolean },
): Promise<[Match | ParsedMatch | null, GetMatchDataMetadata | null]> {
  let [api, gcdata, parsed, archived]: [
    ApiMatch | null,
    GcMatch | null,
    ParserMatch | null,
    ParsedMatch | null,
  ] = await Promise.all([
    apiFetcher.readData(matchId, options?.noBlobStore),
    gcFetcher.readData(matchId, options?.noBlobStore),
    parsedFetcher.readData(matchId, options?.noBlobStore),
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
  redisCount('build_match');
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
    ? metaFetcher.getOrFetchData(Number(matchId))
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
  return matchResult;
}
