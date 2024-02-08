import constants from 'dotaconstants';
import util from 'util';
import config from '../config';
import { teamScenariosQueryParams, metadata } from '../util/scenariosUtil';
import { filterMatches } from '../util/filter';
import db from './db';
import redis from './redis';
import cassandra, { getCassandraColumns } from './cassandra';
import { benchmarks } from '../util/benchmarksUtil';
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
} from '../util/utility';
import {
  readArchivedPlayerMatches,
  tryReadArchivedMatch,
} from './getArchivedData';
import { tryFetchApiData } from './getApiData';
import { type ApiMatch } from './pgroup';
import { gzipSync, gunzipSync } from 'zlib';
import {
  alwaysCols,
  cacheableCols,
  countsCols,
  heroesCols,
  itemsCols,
  matchesCols,
  peersCols,
  significantCols,
} from '../routes/playerFields';
import moment from 'moment';

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
  const purchaseLogs: { rows: any[] } = await db.raw(
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
        item && item.key && item.time != null && constants.items[item.key],
    )
    .map((item) => {
      const time = parseInt(item.time, 10);
      const { cost, id } = constants.items[item.key];
      return { cost, id, time };
    });
  const startGameItems = countItemPopularity(
    items.filter((item) => item.time <= 0 && item.cost <= 600),
  );
  const earlyGameItems = countItemPopularity(
    items.filter(
      (item) => item.time > 0 && item.time < 60 * 10 && item.cost >= 500,
    ),
  );
  const midGameItems = countItemPopularity(
    items.filter(
      (item) =>
        item.time >= 60 * 10 && item.time < 60 * 25 && item.cost >= 1000,
    ),
  );
  const lateGameItems = countItemPopularity(
    items.filter((item) => item.time >= 60 * 25 && item.cost >= 2000),
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
  redisCount(redis, 'player_matches');
  const columns = await getCassandraColumns('player_caches');
  const sanitizedProject = queryObj.project.filter((f: string) => columns[f]);
  const projection = queryObj.projectAll ? ['*'] : sanitizedProject;

  const localOrCached = async () => {
    // Don't use cache if dbLimit (recentMatches) or projectAll (archiving)
    // Check if every requested column can be satisified by cache
    const canCache =
      config.ENABLE_PLAYER_CACHE &&
      !Boolean(queryObj.dbLimit) &&
      projection.every((field) => cacheableCols.has(field as any));
    const cache = canCache
      ? await readCachedPlayerMatches(accountId, projection)
      : undefined;
    return (
      cache ?? readLocalPlayerMatches(accountId, projection, queryObj.dbLimit)
    );
  };

  const [localMatches, archivedMatches] = await Promise.all([
    localOrCached(),
    // if dbLimit (recentMatches), don't use archive
    config.ENABLE_PLAYER_ARCHIVE && !queryObj.dbLimit
      ? readArchivedPlayerMatches(accountId)
      : Promise.resolve([]),
  ]);
  const localLength = localMatches.length;
  const archivedLength = archivedMatches.length;

  let matches = localMatches;
  if (archivedMatches.length) {
    console.time('merge:' + accountId);
    const keys = queryObj.projectAll
      ? (Object.keys(columns) as (keyof ParsedPlayerMatch)[])
      : queryObj.project;
    // Merge together the results
    // Sort both lists into descending order
    localMatches.sort((a, b) => b.match_id - a.match_id);
    archivedMatches.sort((a, b) => b.match_id - a.match_id);
    matches = [];
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
    console.timeEnd('merge:' + accountId);
  }

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

async function readCachedPlayerMatches(
  accountId: number,
  project: string[],
): Promise<ParsedPlayerMatch[]> {
  redisCountDistinct(redis, 'distinct_player_cache', accountId.toString());
  const { rows } = await cassandra.execute(
    `SELECT blob from player_temp WHERE account_id = ?`,
    [accountId],
    { prepare: true, fetchSize: 1 },
  );
  const result = rows[0]?.blob;
  if (result) {
    redisCount(redis, 'player_cache_hit');
    if (
      Number(await redis.zscore('visitors', accountId)) >
      Number(moment().subtract(30, 'day').format('X'))
    ) {
      redisCount(redis, 'auto_player_cache_hit');
    }
    const output = JSON.parse(gunzipSync(result).toString());
    // Remove columns not asked for
    return output.map((m: any) => pick(m, project));
  } else {
    // Uses the imprecise lock algorithm described in https://redis.io/commands/setnx/
    // A client might delete the lock held by another client in the case of the population taking more than the timeout time
    // This is because we use del to release rather than delete only if matches random value
    // But that's ok since this is just an optimization to reduce load
    const lock = await redis.set(
      'player_cache_lock:' + accountId.toString(),
      Date.now().toString(),
      'EX',
      10,
      'NX',
    );
    if (!lock) {
      redisCount(redis, 'player_cache_wait');
      // console.log('[PLAYERCACHE] waiting for lock on %s', accountId);
      // Couldn't acquire the lock, wait and try again
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return readCachedPlayerMatches(accountId, project);
    }
    redisCount(redis, 'player_cache_miss');
    if (
      Number(await redis.zscore('visitors', accountId)) >
      Number(moment().subtract(30, 'day').format('X'))
    ) {
      redisCount(redis, 'auto_player_cache_miss');
    }
    const result = await populateCache(accountId, project);
    // Release the lock
    await redis.del('player_cache_lock:' + accountId.toString());
    return result;
  }
}

export async function populateCache(
  accountId: number,
  project: string[],
): Promise<ParsedPlayerMatch[]> {
  // Populate cache with all columns result
  const all = await readLocalPlayerMatches(
    accountId,
    Array.from(cacheableCols),
  );
  if (all.length) {
    const zip = gzipSync(JSON.stringify(all));
    // console.log(
    //   '[PLAYERCACHE] %s: caching %s matches in %s bytes',
    //   accountId,
    //   all.length,
    //   zip.length,
    // );
    redisCount(redis, 'player_cache_write');
    await cassandra.execute(
      `INSERT INTO player_temp(account_id, blob) VALUES(?, ?) USING TTL ?`,
      [accountId, zip, Number(config.PLAYER_CACHE_SECONDS)],
      { prepare: true },
    );
  }
  return all.map((m: any) => pick(m, project));
}

async function readLocalPlayerMatches(
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
    banner: async () => redis.get('banner'),
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
  backfill: boolean,
): Promise<[Match | ParsedMatch | null, GetMatchDataMetadata | null]> {
  const result = await cassandra.execute(
    'SELECT api, gcdata, parsed, identity, ranks from match_blobs WHERE match_id = ?',
    [matchId],
    {
      prepare: true,
      fetchSize: 1,
      autoPage: true,
    },
  );
  const row = result.rows[0];
  let api: ApiMatch | null = row?.api ? JSON.parse(row.api) : null;
  let gcdata: GcMatch | null = row?.gcdata ? JSON.parse(row.gcdata) : null;
  let parsed: ParsedMatch | null = row?.parsed ? JSON.parse(row.parsed) : null;
  let identity: any = row?.identity ? JSON.parse(row.identity) : null;
  let ranks: any = row?.ranks ? JSON.parse(row.ranks) : null;
  let archived: ParsedMatch | null = null;

  let odData: GetMatchDataMetadata = {
    has_api: Boolean(api),
    has_gcdata: Boolean(gcdata),
    has_parsed: Boolean(parsed),
  };

  if (!api && backfill) {
    redisCount(redis, 'steam_api_backfill');
    api = await tryFetchApiData(matchId);
    if (api) {
      odData.backfill_api = true;
    }
  }
  if (!api) {
    return [null, null];
  }
  if (!gcdata && backfill) {
    redisCount(redis, 'steam_gc_backfill');
    // gcdata = await tryFetchGcData(matchId, getPGroup(api));
    if (gcdata) {
      odData.backfill_gc = true;
    }
  }
  if (backfill) {
    archived = await tryReadArchivedMatch(matchId);
    if (archived) {
      odData.archive = true;
    }
  }

  // Merge the results together
  const final: Match | ParsedMatch = {
    ...archived,
    ...parsed,
    ...gcdata,
    ...api,
    ...identity,
    ...ranks,
    players: api?.players.map((apiPlayer) => {
      const archivedPlayer = archived?.players.find(
        (ap) => ap.player_slot === apiPlayer.player_slot,
      );
      const gcPlayer = gcdata?.players.find(
        (gcp) => gcp.player_slot === apiPlayer.player_slot,
      );
      const parsedPlayer = parsed?.players.find(
        (pp) => pp.player_slot === apiPlayer.player_slot,
      );
      const identityPlayer = identity?.players.find(
        (ip: any) => ip.player_slot === apiPlayer.player_slot,
      );
      const ranksPlayer = ranks?.players.find(
        (rp: any) => rp.player_slot === apiPlayer.player_slot,
      );
      return {
        ...archivedPlayer,
        ...parsedPlayer,
        ...gcPlayer,
        ...apiPlayer,
        ...identityPlayer,
        ...ranksPlayer,
      };
    }),
  };
  return [final, odData];
}
