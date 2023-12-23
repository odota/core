import constants from 'dotaconstants';
import util from 'util';
import config from '../config';
import su from '../util/scenariosUtil';
import { filterMatches } from '../util/filter';
import db from './db';
import redis from './redis';
import cassandra from './cassandra';
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
} from '../util/utility';
import { cassandraColumnInfo, cleanRowCassandra } from './insert';
import {
  readArchivedPlayerMatches,
  tryReadArchivedMatch,
} from './getArchivedData';
import { tryFetchApiData } from './getApiData';
import type { ApiMatch } from './pgroup';

/**
 * Benchmarks a match against stored data in Redis
 * */
export async function getMatchBenchmarks(m: Match) {
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
  accountId: string,
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
  accountId: string,
  queryObj: QueryObj,
): Promise<[ParsedPlayerMatch[], PlayerMatchesMetadata | null]> {
  // Validate accountId
  if (
    !accountId ||
    !Number.isInteger(Number(accountId)) ||
    Number(accountId) <= 0
  ) {
    return [[], null];
  }
  // call clean method to ensure we have column info cached
  await cleanRowCassandra(cassandra, 'player_caches', {});
  // console.log(queryObj.project, cassandraColumnInfo.player_caches);
  const query = util.format(
    `
      SELECT %s FROM player_caches
      WHERE account_id = ?
      ORDER BY match_id DESC
      ${queryObj.dbLimit ? `LIMIT ${queryObj.dbLimit}` : ''}
    `,
    // Only allow selecting fields present in column names data
    queryObj.projectAll
      ? '*'
      : queryObj.project
          .filter((f: string) => cassandraColumnInfo.player_caches?.[f])
          .join(','),
  );
  const [localMatches, archivedMatches] = await Promise.all([
    new Promise<ParsedPlayerMatch[]>((resolve, reject) => {
      console.time('cassandra:' + accountId);
      let localMatches: ParsedPlayerMatch[] = [];
      cassandra.eachRow(
        query,
        [accountId],
        {
          prepare: true,
          fetchSize: 5000,
          autoPage: true,
        },
        (n, row) => {
          const m = deserialize(row);
          localMatches.push(m);
        },
        (err) => {
          console.timeEnd('cassandra:' + accountId);
          if (err) {
            return reject(err);
          }
          return resolve(localMatches);
        },
      );
    }),
    // for dbLimit (recentMatches), skip the archive and just return 20 most recent
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
      ? (Object.keys(
          cassandraColumnInfo.player_caches,
        ) as (keyof ParsedPlayerMatch)[])
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

  console.time('process:' + accountId);
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
  console.timeEnd('process:' + accountId);
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

export async function getFullPlayerMatchesWithMetadata(
  accountId: string,
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
  const playerData: User | undefined = await db
    .first(
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
  player: { account_id: string },
) {
  let teammatesArr: PeersCount[string][] = [];
  const teammates = input;
  Object.keys(teammates).forEach((id) => {
    const tm = teammates[id];
    const numId = Number(id);
    // don't include if anonymous, self or if few games together
    if (
      numId &&
      numId !== Number(player.account_id) &&
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
  player: { account_id: string },
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
    .filter((r) => r.account_id !== player.account_id && r.games)
    .sort((a, b) => b.games - a.games);
  return arr;
}

export async function getMatchRankTier(
  players: { account_id?: number | null }[],
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
      return row ? row.rating : null;
    }),
  );
  // Remove undefined/null values
  const filt = result.filter(Boolean);
  const avg = averageMedal(filt.map((r) => Number(r))) || null;
  return { avg, num: filt.length };
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
    (su.teamScenariosQueryParams.includes(req.query.scenario as string) &&
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
    scenarios: async () => su.metadata,
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
    [account_id],
  );
  return Boolean(result.rows?.[0]);
}

export async function getMatchDataFromBlobWithMetadata(
  matchId: number,
  backfill: boolean,
): Promise<[Match | ParsedMatch | null, GetMatchDataMetadata | null]> {
  const result = await cassandra.execute(
    'SELECT api, gcdata, parsed from match_blobs WHERE match_id = ?',
    [matchId],
    {
      prepare: true,
      fetchSize: 1,
      autoPage: true,
    },
  );
  const row = result.rows[0];
  let api: ApiMatch | undefined = row?.api ? JSON.parse(row.api) : undefined;
  let gcdata: GcMatch | undefined = row?.gcdata
    ? JSON.parse(row.gcdata)
    : undefined;
  let parsed: ParsedMatch | undefined = row?.parsed
    ? JSON.parse(row.parsed)
    : undefined;

  let odData: GetMatchDataMetadata = {
    has_api: Boolean(api),
    has_gcdata: Boolean(gcdata),
    has_parsed: Boolean(parsed),
  };

  if (!api && backfill) {
    api = await tryFetchApiData(matchId);
    if (api) {
      // Count for logging
      redisCount(redis, 'steam_api_backfill');
      odData.backfill_api = true;
    }
  }
  if (!api) {
    return [null, null];
  }
  if (!gcdata && backfill) {
    redisCount(redis, 'steam_gc_backfill');
    // TODO (howard) maybe turn this on after we get some data on how often it's called
    // gcdata = await tryFetchGcData(matchId, getPGroup(api));
    if (gcdata) {
      odData.backfill_gc = true;
    }
  }
  if (!parsed && backfill) {
    parsed = await tryReadArchivedMatch(matchId.toString());
    if (parsed) {
      odData.archive = true;
    }
  }

  // Merge the results together
  const final: Match | ParsedMatch = {
    ...parsed,
    ...gcdata,
    ...api,
    players: api?.players.map((apiPlayer: any) => {
      const gcPlayer = gcdata?.players.find(
        (gcp: any) => gcp.player_slot === apiPlayer.player_slot,
      );
      const parsedPlayer = parsed?.players.find(
        (pp: any) => pp.player_slot === apiPlayer.player_slot,
      );
      return {
        ...parsedPlayer,
        ...gcPlayer,
        ...apiPlayer,
      };
    }),
  };
  return [final, odData];
}

export async function getMatchDataFromCassandra(
  matchId: number,
): Promise<Partial<ParsedMatch> | null> {
  const result = await cassandra.execute(
    'SELECT * FROM matches where match_id = ?',
    [matchId],
    {
      prepare: true,
      fetchSize: 1,
      autoPage: true,
    },
  );
  const deserializedResult = result.rows.map((m) => deserialize(m));
  const final: ParsedMatch | null = deserializedResult[0];
  if (!final) {
    return null;
  }
  return final;
}

export async function getPlayerMatchData(
  matchId: number,
): Promise<ParsedPlayer[]> {
  const result = await cassandra.execute(
    'SELECT * FROM player_matches where match_id = ?',
    [matchId],
    {
      prepare: true,
      fetchSize: 24,
      autoPage: true,
    },
  );
  const deserializedResult = result.rows.map((m) => deserialize(m));
  return deserializedResult;
}
