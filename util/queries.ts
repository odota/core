import { items as itemsConstants } from 'dotaconstants';
import util from 'util';
import config from '../config';
import { teamScenariosQueryParams, metadata } from './scenariosUtil';
import { filterMatches } from './filter';
import db from '../store/db';
import redis from '../store/redis';
import cassandra, { getCassandraColumns } from '../store/cassandra';
import { benchmarks } from './benchmarksUtil';
import type knex from 'knex';
import type { Request } from 'express';
import {
  getStartOfBlockMinutes,
  countItemPopularity,
  deserialize,
  getAnonymousAccountId,
  isContributor,
  averageMedal,
  pick,
  parallelPromise,
  PeersCount,
  redisCount,
  redisCountDistinct,
} from './utility';
import {
  readArchivedPlayerMatches
} from '../fetcher/getPlayerArchive';
import { type ApiMatch } from './pgroup';
import { gzipSync, gunzipSync } from 'zlib';
import { cacheableCols } from '../routes/playerFields';
import { promises as fs } from 'fs';
import { ParsedFetcher } from '../fetcher/getParsedData';
import { ApiFetcher } from '../fetcher/getApiData';
import { GcdataFetcher } from '../fetcher/getGcData';
import { ArchivedFetcher } from '../fetcher/getArchivedData';

const apiFetcher = new ApiFetcher();
const gcFetcher = new GcdataFetcher();
const parsedFetcher = new ParsedFetcher();
const archivedFetcher = new ArchivedFetcher();

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
export async function getDistributions() {
  const result: AnyDict = {};
  const keys = ['distribution:ranks'];
  for (let i = 0; i < keys.length; i++) {
    const r = keys[i];
    const blob = await redis.get(r);
    result[r.split(':')[1]] = blob ? JSON.parse(blob) : null;
  }
  return result;
}

export async function getHeroRankings(heroId: string) {
  const result = await db.raw(
    `
  SELECT players.account_id, score, personaname, name, avatar, last_login, rating as rank_tier
  from hero_ranking
  join players using(account_id)
  left join notable_players using(account_id)
  left join rank_tier using(account_id)
  WHERE hero_id = ?
  ORDER BY score DESC
  LIMIT 100
  `,
    [heroId || 0],
  );
  return {
    hero_id: Number(heroId),
    rankings: result.rows,
  };
}
export async function getHeroItemPopularity(heroId: string) {
  const purchaseLogs: { rows: { purchase_log: {key: keyof typeof itemsConstants, time: string}[]}[] } = await db.raw(
    `
  SELECT purchase_log
  FROM player_matches
  JOIN matches USING(match_id)
  WHERE hero_id = ? AND version IS NOT NULL
  ORDER BY match_id DESC
  LIMIT 100
  `,
    [heroId || 0],
  );
  const items = purchaseLogs.rows
    .flatMap((purchaseLog) => purchaseLog.purchase_log)
    .filter(
      (item) =>
        item && item.key && item.time != null && itemsConstants[item.key],
    )
    .map((item) => {
      const time = parseInt(item.time, 10);
      const { cost, id } = itemsConstants[item.key];
      return { cost, id, time };
    });
  const startGameItems = countItemPopularity(
    items.filter((item) => item.time <= 0 && item.cost != null && item.cost <= 600),
  );
  const earlyGameItems = countItemPopularity(
    items.filter(
      (item) => item.time > 0 && item.time < 60 * 10 && item.cost != null && item.cost >= 500,
    ),
  );
  const midGameItems = countItemPopularity(
    items.filter(
      (item) =>
        item.time >= 60 * 10 && item.time < 60 * 25 && item.cost != null && item.cost >= 1000,
    ),
  );
  const lateGameItems = countItemPopularity(
    items.filter((item) => item.time >= 60 * 25 && item.cost != null && item.cost >= 2000),
  );
  return {
    start_game_items: startGameItems,
    early_game_items: earlyGameItems,
    mid_game_items: midGameItems,
    late_game_items: lateGameItems,
  };
}
export async function getHeroBenchmarks(heroId: string) {
  const ret: AnyDict = {};
  const arr = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99];
  const items: [metric: string, percentile: number][] = [];
  Object.keys(benchmarks).forEach((metric) => {
    arr.forEach((percentile) => {
      items.push([metric, percentile]);
    });
  });
  await Promise.all(
    items.map(async ([metric, percentile]) => {
      // Use data from previous epoch
      let key = [
        'benchmarks',
        getStartOfBlockMinutes(Number(config.BENCHMARK_RETENTION_MINUTES), -1),
        metric,
        heroId,
      ].join(':');
      const backupKey = [
        'benchmarks',
        getStartOfBlockMinutes(Number(config.BENCHMARK_RETENTION_MINUTES), 0),
        metric,
        heroId,
      ].join(':');
      const exists = await redis.exists(key);
      if (exists === 0) {
        // No data, use backup key (current epoch)
        key = backupKey;
      }
      const card = await redis.zcard(key);
      const position = Math.floor((card || 0) * percentile);
      const result = await redis.zrange(key, position, position, 'WITHSCORES');
      const obj = {
        percentile,
        value: Number(result?.[1]),
      };
      if (!ret[metric]) {
        ret[metric] = [];
      }
      ret[metric].push(obj);
    }),
  );
  return {
    hero_id: Number(heroId),
    result: ret,
  };
}

export async function getPlayerMatches(
  accountId: number,
  queryObj: QueryObj,
): Promise<ParsedPlayerMatch[]> {
  return (await getPlayerMatchesWithMetadata(accountId, queryObj))[0];
}

type PlayerMatchesMetadata = {
  finalLength: number;
  localLength: number;
  archivedLength: number;
  mergedLength: number;
};

export async function getPlayerMatchesWithMetadata(
  accountId: number,
  queryObj: QueryObj,
): Promise<[ParsedPlayerMatch[], PlayerMatchesMetadata | null]> {
  // Validate accountId
  if (!accountId || !Number.isInteger(accountId) || accountId <= 0) {
    return [[], null];
  }
  if (queryObj.isPrivate) {
    // User disabled public match history from Dota, so don't return matches
    return [[], null];
  }
  redisCount('player_matches');
  const columns = await getCassandraColumns('player_caches');
  const sanitizedProject = queryObj.project.filter((f: string) => columns[f]);
  const projection = queryObj.projectAll ? ['*'] : sanitizedProject;

  // Archive model
  // For inactive, unvisited players with a large number of matches, get all columns for their player_caches and store in single blob in archive
  // Record some metadata indicating this player is archived
  // Delete the data from player_caches
  // On read, check metadata to see whether this player is archived
  // if so reinsert the data into player_caches from archive
  // Maybe want to track the reinsert time as well so we don't fetch and merge from archive every time?
  // maybe we can merge rows on reinsert? But need to decide whether to keep current or archived if both are present, use in-memory merge
  // Background process continually rechecks for players eligible to be archived and re-archives the data from player_caches
  // This should help keep player_caches size under control (and may avoid the need to maintain player_temp)

  const canUseTemp =
    config.ENABLE_PLAYER_CACHE &&
    !Boolean(queryObj.dbLimit) &&
    projection.every((field) => cacheableCols.has(field as any));
  // Don't use temp table if dbLimit (recentMatches) or projectAll (archiving)
  // Check if every requested column can be satisified by temp
  const localMatches = canUseTemp
    ? await readPlayerTemp(accountId, projection)
    : await readPlayerCaches(accountId, projection, queryObj.dbLimit);
  // if dbLimit (recentMatches), don't use archive
  const archivedMatches =
    config.ENABLE_PLAYER_ARCHIVE && !queryObj.dbLimit
      ? await readArchivedPlayerMatches(accountId)
      : [];
  const localLength = localMatches.length;
  const archivedLength = archivedMatches.length;

  const keys = queryObj.projectAll
    ? (Object.keys(columns) as (keyof ParsedPlayerMatch)[])
    : queryObj.project;
  // Merge the two sets of matches
  let matches = mergeMatches(localMatches, archivedMatches, keys);
  const filtered = filterMatches(matches, queryObj.filter);
  const sort = queryObj.sort;
  if (sort) {
    filtered.sort((a, b) => b[sort] - a[sort]);
  } else {
    // Default sort by match_id desc
    filtered.sort((a, b) => b.match_id - a.match_id);
  }
  const offset = filtered.slice(queryObj.offset || 0);
  const final = offset.slice(0, queryObj.limit || offset.length);
  return [
    final,
    {
      finalLength: final.length,
      localLength,
      archivedLength,
      mergedLength: matches.length,
    },
  ];
}

function mergeMatches(
  localMatches: ParsedPlayerMatch[],
  archivedMatches: ParsedPlayerMatch[],
  keys: (keyof ParsedPlayerMatch)[],
): ParsedPlayerMatch[] {
  if (archivedMatches.length) {
    const matches: ParsedPlayerMatch[] = [];
    // Merge together the results
    // Sort both lists into descending order
    localMatches.sort((a, b) => b.match_id - a.match_id);
    archivedMatches.sort((a, b) => b.match_id - a.match_id);
    while (localMatches.length || archivedMatches.length) {
      const localMatch = localMatches[0];
      const archivedMatch = archivedMatches[0];
      // If the IDs of the first elements match, pop both and then merge them together
      if (localMatch?.match_id === archivedMatch?.match_id) {
        // Only pick selected columns from those matches
        // Local match has the desired columns
        Object.keys(localMatch).forEach((key) => {
          const typedKey = key as keyof ParsedPlayerMatch;
          // For each key prefer nonnull value, with precedence to local store
          //@ts-ignore
          localMatch[typedKey] =
            localMatch[typedKey] ?? archivedMatch[typedKey] ?? null;
        });
        // Output the merged version
        matches.push(localMatch);
        // Pop both from array
        localMatches.shift();
        archivedMatches.shift();
      } else {
        // Otherwise just push the higher ID element into the merge
        if ((localMatch?.match_id ?? 0) > (archivedMatch?.match_id ?? 0)) {
          matches.push(localMatches.shift()!);
        } else {
          // Pick only specified columns of the archived match
          matches.push(pick(archivedMatches.shift(), keys));
        }
      }
    }
  }
  return localMatches;
}

async function readPlayerTemp(
  accountId: number,
  project: string[],
): Promise<ParsedPlayerMatch[]> {
  let result = null;
  try {
    result = await fs.readFile('./cache/' + accountId);
  } catch {
    // Might not exist, so just ignore
  }
  if (result) {
    redisCount('player_temp_hit');
    redisCountDistinct('distinct_player_temp', accountId.toString());
    const zip = gunzipSync(result).toString();
    const output = JSON.parse(zip);
    // Remove columns not asked for
    return output.map((m: any) => pick(m, project));
  } else {
    // Uses the imprecise lock algorithm described in https://redis.io/commands/setnx/
    // A client might delete the lock held by another client in the case of the population taking more than the timeout time
    // This is because we use del to release rather than delete only if matches random value
    // But that's ok since this is just an optimization to reduce load
    const lock = await redis.set(
      'player_temp_lock:' + accountId.toString(),
      Date.now().toString(),
      'EX',
      10,
      'NX',
    );
    if (!lock) {
      redisCount('player_temp_wait');
      // console.log('[PLAYERCACHE] waiting for lock on %s', accountId);
      // Couldn't acquire the lock, wait and try again
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return readPlayerTemp(accountId, project);
    }
    const result = await populateTemp(accountId, project);
    // Release the lock
    await redis.del('player_temp_lock:' + accountId.toString());
    if (result.length >= Number(config.PLAYER_CACHE_THRESHOLD)) {
      // Should have cached since large
      redisCount('player_temp_miss');
    } else {
      // Small read anyway so don't need to use cache
      redisCount('player_temp_skip');
    }
    return result;
  }
}

export async function populateTemp(
  accountId: number,
  project: string[],
): Promise<ParsedPlayerMatch[]> {
  // Populate cache with all columns result
  const all = await readPlayerCaches(accountId, Array.from(cacheableCols));
  if (all.length >= Number(config.PLAYER_CACHE_THRESHOLD)) {
    const zip = gzipSync(JSON.stringify(all));
    redisCount('player_temp_write');
    redisCount('player_temp_write_bytes', zip.length);
    await fs.mkdir('./cache', { recursive: true });
    await fs.writeFile('./cache/' + accountId, zip);
  }
  return all.map((m: any) => pick(m, project));
}

async function readPlayerCaches(
  accountId: number,
  project: string[],
  limit?: number,
) {
  const query = util.format(
    `
      SELECT %s FROM player_caches
      WHERE account_id = ?
      ORDER BY match_id DESC
      ${limit ? `LIMIT ${limit}` : ''}
    `,
    project.join(','),
  );
  return new Promise<ParsedPlayerMatch[]>((resolve, reject) => {
    let result: ParsedPlayerMatch[] = [];
    cassandra.eachRow(
      query,
      [accountId],
      {
        prepare: true,
        fetchSize: 1000,
        autoPage: true,
      },
      (n, row) => {
        const m = deserialize(row);
        result.push(m);
      },
      (err) => {
        if (err) {
          return reject(err);
        }
        return resolve(result);
      },
    );
  });
}

export async function getFullPlayerMatchesWithMetadata(
  accountId: number,
): Promise<[ParsedPlayerMatch[], PlayerMatchesMetadata | null]> {
  return getPlayerMatchesWithMetadata(accountId, {
    project: [],
    projectAll: true,
  });
}

export async function getPlayerRatings(accountId: string) {
  return db
    .from('player_ratings')
    .where({
      account_id: Number(accountId),
    })
    .orderBy('time', 'asc');
}
export async function getPlayerHeroRankings(accountId: string): Promise<any[]> {
  const result = await db.raw(
    `
  SELECT
  hero_id,
  playerscore.score,
  count(1) filter (where hr.score <= playerscore.score)::float/count(1) as percent_rank,
  count(1) * 4000 card
  FROM (select * from hero_ranking TABLESAMPLE SYSTEM(0.025)) hr
  JOIN (select hero_id, score from hero_ranking hr2 WHERE account_id = ?) playerscore using (hero_id)
  GROUP BY hero_id, playerscore.score
  ORDER BY percent_rank desc
  `,
    [accountId],
  );
  return result.rows;
}
export async function getPlayer(
  db: knex.Knex,
  accountId: number,
): Promise<User | undefined> {
  const playerData = await db
    .first<User>(
      'players.account_id',
      'personaname',
      'name',
      'plus',
      'cheese',
      'steamid',
      'avatar',
      'avatarmedium',
      'avatarfull',
      'profileurl',
      'last_login',
      'loccountrycode',
      'subscriber.status',
      'fh_unavailable',
    )
    .from('players')
    .leftJoin(
      'notable_players',
      'players.account_id',
      'notable_players.account_id',
    )
    .leftJoin('subscriber', 'players.account_id', 'subscriber.account_id')
    .where({
      'players.account_id': Number(accountId),
    });
  if (playerData) {
    playerData.is_contributor = isContributor(accountId.toString());
    playerData.is_subscriber = Boolean(playerData?.status);
  }
  return playerData;
}
export async function getPeers(
  input: PeersCount,
  player: { account_id: number },
) {
  let teammatesArr: PeersCount[string][] = [];
  const teammates = input;
  Object.keys(teammates).forEach((id) => {
    const tm = teammates[id];
    const numId = Number(id);
    // don't include if anonymous, self or if few games together
    if (
      numId &&
      numId !== player.account_id &&
      numId !== getAnonymousAccountId() &&
      tm.games >= 5
    ) {
      teammatesArr.push(tm);
    }
  });
  teammatesArr.sort((a, b) => b.games - a.games);
  // limit to 200 max players
  teammatesArr = teammatesArr.slice(0, 200);
  return Promise.all(
    teammatesArr.map(async (t) => {
      const row: AnyDict = await db
        .first(
          'players.account_id',
          'personaname',
          'name',
          'avatar',
          'avatarfull',
          'last_login',
          'subscriber.status',
        )
        .from('players')
        .leftJoin(
          'notable_players',
          'players.account_id',
          'notable_players.account_id',
        )
        .leftJoin('subscriber', 'players.account_id', 'subscriber.account_id')
        .where({
          'players.account_id': t.account_id,
        });
      if (!row) {
        return { ...t };
      }
      return {
        ...t,
        personaname: row.personaname,
        name: row.name,
        is_contributor: isContributor(t.account_id),
        is_subscriber: Boolean(row.status),
        last_login: row.last_login,
        avatar: row.avatar,
        avatarfull: row.avatarfull,
      };
    }),
  );
}
export async function getProPeers(
  input: PeersCount,
  player: { account_id: number },
) {
  const teammates = input;
  const { rows }: { rows: any[] } = await db.raw(
    `select *, notable_players.account_id
          FROM notable_players
          LEFT JOIN players
          ON notable_players.account_id = players.account_id
          `,
  );
  const arr: PeersCount[string][] = rows
    .map((r) => ({ ...r, ...teammates[r.account_id] }))
    .filter((r) => Number(r.account_id) !== player.account_id && r.games)
    .sort((a, b) => b.games - a.games);
  return arr;
}

export async function getMatchRankTier(
  players: { account_id?: number | null; player_slot: number }[],
) {
  const result = await Promise.all(
    players.map(async (player) => {
      if (!player.account_id) {
        return;
      }
      const row = await db
        .first()
        .from('rank_tier')
        .where({ account_id: player.account_id });
      return row ? row.rating : undefined;
    }),
  );
  // Remove undefined/null values
  const filt = result.filter(Boolean);
  const avg = averageMedal(filt.map((r) => Number(r)));
  return {
    avg,
    num: filt.length,
    players: result.map((r, i) => ({
      player_slot: players[i].player_slot,
      rank_tier: r,
    })),
  };
}

export async function getItemTimings(req: Request): Promise<any[]> {
  const heroId = req.query.hero_id || 0;
  const item = req.query.item || '';
  const result = await db.raw(
    `SELECT hero_id, item, time, sum(games) games, sum(wins) wins
     FROM scenarios
     WHERE item IS NOT NULL
     AND (0 = :heroId OR hero_id = :heroId)
     AND ('' = :item OR item = :item)
     GROUP BY hero_id, item, time ORDER BY time, hero_id, item
     LIMIT 1600`,
    { heroId, item },
  );
  return result.rows;
}
export async function getLaneRoles(req: Request): Promise<any[]> {
  const heroId = req.query.hero_id || 0;
  const lane = req.query.lane_role || 0;
  const result = await db.raw(
    `SELECT hero_id, lane_role, time, sum(games) games, sum(wins) wins
     FROM scenarios
     WHERE lane_role IS NOT NULL
     AND (0 = :heroId OR hero_id = :heroId)
     AND (0 = :lane OR lane_role = :lane)
     GROUP BY hero_id, lane_role, time ORDER BY hero_id, time, lane_role
     LIMIT 1200`,
    { heroId, lane },
  );
  return result.rows;
}
export async function getTeamScenarios(req: Request): Promise<any[]> {
  const scenario =
    (teamScenariosQueryParams.includes(req.query.scenario as string) &&
      req.query.scenario) ||
    '';
  const result = await db.raw(
    `SELECT scenario, is_radiant, region, sum(games) games, sum(wins) wins
     FROM team_scenarios
     WHERE ('' = :scenario OR scenario = :scenario)
     GROUP BY scenario, is_radiant, region ORDER BY scenario
     LIMIT 1000`,
    { scenario },
  );
  return result.rows;
}
export async function getMetadata(req: Request) {
  const obj = {
    scenarios: async () => metadata,
    user: async () => req.user,
    isSubscriber: async () => {
      if (req.user?.account_id) {
        return isSubscriber(req.user.account_id);
      }
      return false;
    },
  };
  // A bit convoluted to support proper typing and parallel, but testing this out
  return parallelPromise<{
    [P in keyof typeof obj]: Awaited<ReturnType<(typeof obj)[P]>>;
  }>(obj);
}

export async function isSubscriber(account_id: string) {
  const result: { rows: any[] } = await db.raw(
    "SELECT account_id from subscriber WHERE account_id = ? AND status = 'active'",
    [Number(account_id)],
  );
  return Boolean(result.rows?.[0]);
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
    !options?.noArchive ? archivedFetcher.readData(matchId) : Promise.resolve(null),
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
