import { heroes } from 'dotaconstants';
import config from '../../config.ts';
import { computeMatchData } from './compute.ts';
import { buildReplayUrl, isContributor, isTurbo } from './utility.ts';
import redis, { redisCount } from '../store/redis.ts';
import db from '../store/db.ts';
import { benchmarks } from './benchmarksUtil.ts';
import * as allFetchers from '../fetcher/allFetchers.ts';
import { getMatchBlob } from './getMatchBlob.ts';
import { getStartOfBlockMinutes } from './time.ts';

const { metaFetcher } = allFetchers;

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

async function getProMatchInfo(match: Match): Promise<{
  radiant_team?: any;
  dire_team?: any;
  league?: any;
  series_id?: number;
  series_type?: number;
  cluster?: number;
  replay_salt?: number;
}> {
  const resultPromise = db
    .first([
      'series_id',
      'series_type',
      'cluster',
      'replay_salt',
    ])
    .from('matches')
    .where({
      match_id: match.match_id,
    });
  const leaguePromise = 'leagueid' in match ? db.first().from('leagues').where({
    leagueid: match.leagueid,
  }) : Promise.resolve(undefined);
  const radiantTeamPromise = 'radiant_team_id' in match ? db.first().from('teams').where({
    team_id: match.radiant_team_id,
  }): Promise.resolve(undefined);
  const direTeamPromise = 'dire_team_id' in match ? db.first().from('teams').where({
    team_id: match.dire_team_id,
  }) : Promise.resolve(undefined);
  const [result, league, radiantTeam, direTeam] = await Promise.all([
    resultPromise,
    leaguePromise,
    radiantTeamPromise,
    direTeamPromise,
  ]);
  const final = {
    league,
    radiant_team: radiantTeam,
    dire_team: direTeam,
    series_id: result?.series_id ?? undefined,
    series_type: result?.series_type ?? undefined,
    cluster: result?.cluster ?? undefined,
    replay_salt: result?.replay_salt ?? undefined,
  };
  return final;
}

/**
 * Adds benchmark data to the players in a match
 * */
export async function getPlayerBenchmarks(m: Match) {
  const turbo = isTurbo(m);
  return Promise.all(
    m.players.map(async (p) => {
      const result: Record<string, { raw?: number; pct?: number }> = {};
      for (let metric of Object.keys(benchmarks)) {
        result[metric] = {};
        // Use data from previous epoch
        let key = [
          'benchmarks',
          getStartOfBlockMinutes(
            Number(config.BENCHMARK_RETENTION_MINUTES),
            -1,
          ),
          metric,
          p.hero_id,
          turbo ? 'turbo' : '',
        ].join(':');
        const backupKey = [
          'benchmarks',
          getStartOfBlockMinutes(Number(config.BENCHMARK_RETENTION_MINUTES), 0),
          metric,
          p.hero_id,
          turbo ? 'turbo' : '',
        ].join(':');
        const raw = benchmarks[metric](m, p);
        result[metric] = {
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
          result[metric].pct = pct;
        }
      }
      return result;
    }),
  );
}

async function getPlayerDetails(match: Match | ParsedMatch) {
  return Promise.all(
    // Get names, last login for players from DB
    match.players.map(async (p) => {
      const { rows } = await db.raw(
        `
        SELECT personaname, name, last_login, rating, status, computed_mmr
        FROM players
        LEFT JOIN notable_players USING(account_id)
        LEFT JOIN rank_tier USING(account_id)
        LEFT JOIN player_computed_mmr USING(account_id)
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
        computed_mmr: row?.computed_mmr,
        is_subscriber: Boolean(row?.status),
      };
    }),
  );
}

async function getCosmetics(match: Match | ParsedMatch) {
  if ('cosmetics' in match && match.cosmetics) {
    return Promise.all(
      Object.keys(match.cosmetics).map((itemId) =>
        db.first().from('cosmetics').where({
          item_id: itemId,
        }),
      ),
    );
  }
  return null;
}

async function getMeta(matchId: number | undefined) {
  if (matchId) {
    return metaFetcher.getOrFetchData(matchId, null);
  }
  return null;
}

export async function buildMatch(
  matchId: number,
  options: { meta?: string },
): Promise<Match | ParsedMatch | null> {
  if (!matchId || !Number.isInteger(matchId) || matchId <= 0) {
    return null;
  }

  // track distribution of matches requested
  // const bucket = Math.floor(matchId / 1000000000);
  // redisCount((bucket + '_match_req') as MetricName);
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
  ] = await getMatchBlob(matchId, allFetchers);
  if (!match) {
    return null;
  }
  match.od_data = odData;
  const [players, prodata, cosmetics, metadata, playerBenchmarks] =
    await Promise.all([
      getPlayerDetails(match),
      getProMatchInfo(match),
      getCosmetics(match),
      getMeta(options.meta ? matchId : undefined),
      getPlayerBenchmarks(match),
    ]);
  let matchResult: Match | ParsedMatch = {
    ...match,
    ...prodata,
    metadata,
    players: players
      .map((p) => extendPlayerData(p, match))
      .map((p) => {
        if (!cosmetics) {
          return p;
        }
        const hero = heroes[String(p.hero_id) as keyof typeof heroes] || {};
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
      })
      .map((p, i) => {
        return { ...p, benchmarks: playerBenchmarks[i] };
      }),
    replay_url: match.replay_salt
      ? buildReplayUrl(match.match_id, match.cluster, match.replay_salt)
      : undefined,
  };
  computeMatchData(matchResult as ParsedPlayerMatch);

  // Save in cache
  if (matchResult && config.ENABLE_MATCH_CACHE) {
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
