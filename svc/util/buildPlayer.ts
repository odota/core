import {
  buildFilterConditions,
  getPatchSqlExpr,
  getRegionSqlExpr,
} from "./filter.ts";
import { redisCount } from "../store/redis.ts";
import clickhouse, { getClickhouseColumns } from "../store/clickhouse.ts";
import { deserialize } from "./utility.ts";
import {
  countsCats,
  histogramCols,
  wardmapCols,
  wordcloudCols,
} from "../api/playerFields.ts";
import { heroes } from "dotaconstants";

export async function getPlayerMatches(
  accountId: number,
  queryObj: QueryObj,
): Promise<ParsedPlayerMatch[]> {
  // Validate accountId
  if (!accountId || !Number.isInteger(accountId) || accountId <= 0) {
    return [];
  }
  if (queryObj.isPrivate) {
    // User disabled public match history from Dota, so don't return matches
    return [];
  }
  redisCount("player_matches");

  const columns = await getClickhouseColumns("player_caches");
  const sanitizedProject = [
    ...new Set(queryObj.project.filter((f: string) => Object.hasOwn(columns, f))),
  ];
  const projection = queryObj.projectAll ? ["*"] : sanitizedProject;
  const query = await buildPlayerQuery(accountId, queryObj, projection, true);
  const rows = await clickhouse.query(query);
  return rows.map((row) => deserialize(row));
}

async function buildPlayerQuery(
  accountId: number,
  queryObj: QueryObj,
  cols: readonly string[],
  alwaysOrder = false,
): Promise<string> {
  const columns = await getClickhouseColumns("player_caches");
  const selectCols = cols.length ? [...new Set(cols)].join(", ") : "*";
  const filterConds = buildFilterConditions(queryObj.filter);
  const whereClause = [`account_id = ${Number(accountId)}`, ...filterConds].join(
    " AND ",
  );
  const sortCol =
    queryObj.sort && Object.hasOwn(columns, queryObj.sort)
      ? queryObj.sort
      : "match_id";
  const limitVal = queryObj.limit ? Number(queryObj.limit) : 0;
  const offsetVal = queryObj.offset ? Number(queryObj.offset) : 0;
  let limitClause = "";
  if (limitVal > 0 && offsetVal > 0) {
    limitClause = `LIMIT ${limitVal} OFFSET ${offsetVal}`;
  } else if (limitVal > 0) {
    limitClause = `LIMIT ${limitVal}`;
  } else if (offsetVal > 0) {
    limitClause = `OFFSET ${offsetVal}`;
  }
  const orderClause =
    alwaysOrder || limitClause
      ? `ORDER BY ${sortCol} DESC NULLS LAST ${limitClause}`
      : "";
  return `SELECT ${selectCols} FROM player_caches FINAL WHERE ${whereClause} ${orderClause}`;
}

export async function getPlayerWinLoss(
  accountId: number,
  queryObj: QueryObj,
): Promise<{ win: number; lose: number }> {
  if (
    !accountId ||
    !Number.isInteger(accountId) ||
    accountId <= 0 ||
    queryObj.isPrivate
  ) {
    return { win: 0, lose: 0 };
  }
  redisCount("player_matches");
  const sub = await buildPlayerQuery(accountId, queryObj, [
    "player_slot",
    "radiant_win",
  ]);
  const winExpr =
    "((ifNull(player_slot, 0) < 128) = ifNull(radiant_win, false))";
  const rows = await clickhouse.query<{ win: number; lose: number }>(
    `SELECT toInt32(countIf(${winExpr})) AS win, toInt32(countIf(NOT ${winExpr})) AS lose FROM (${sub})`,
  );
  return rows[0] ?? { win: 0, lose: 0 };
}

export async function getPlayerTotals(
  accountId: number,
  queryObj: QueryObj,
): Promise<{ field: string; n: number; sum: number }[]> {
  const empty = histogramCols.map((key) => ({ field: key, n: 0, sum: 0 }));
  if (
    !accountId ||
    !Number.isInteger(accountId) ||
    accountId <= 0 ||
    queryObj.isPrivate
  ) {
    return empty;
  }
  redisCount("player_matches");
  const sub = await buildPlayerQuery(accountId, queryObj, histogramCols);
  const selectParts = histogramCols.map(
    (k) =>
      `toInt32(count(${k})) AS ${k}_n, toFloat64(ifNull(sum(${k}), 0)) AS ${k}_sum`,
  );
  const rows = await clickhouse.query(
    `SELECT ${selectParts.join(", ")} FROM (${sub})`,
  );
  const row = rows[0] || {};
  return histogramCols.map((key) => ({
    field: key,
    n: Number(row[`${key}_n`] ?? 0),
    sum: Number(row[`${key}_sum`] ?? 0),
  }));
}

export async function getPlayerCounts(
  accountId: number,
  queryObj: QueryObj,
): Promise<Record<(typeof countsCats)[number], AnyDict>> {
  const result = {} as Record<(typeof countsCats)[number], AnyDict>;
  countsCats.forEach((key) => {
    result[key] = {};
  });
  if (
    !accountId ||
    !Number.isInteger(accountId) ||
    accountId <= 0 ||
    queryObj.isPrivate
  ) {
    return result;
  }
  redisCount("player_matches");
  const sub = await buildPlayerQuery(accountId, queryObj, [
    "player_slot",
    "radiant_win",
    "leaver_status",
    "game_mode",
    "lobby_type",
    "lane_role",
    "cluster",
    "start_time",
  ]);
  const winExpr =
    "((ifNull(player_slot, 0) < 128) = ifNull(radiant_win, false))";
  const catExprs: Record<(typeof countsCats)[number], string> = {
    leaver_status: "toInt32(ifNull(leaver_status, 0))",
    game_mode: "toInt32(ifNull(game_mode, 0))",
    lobby_type: "toInt32(ifNull(lobby_type, 0))",
    lane_role: "toInt32(ifNull(lane_role, 0))",
    region: `toInt32(ifNull(${getRegionSqlExpr("cluster")}, 0))`,
    patch: `toInt32(ifNull(${getPatchSqlExpr("start_time")}, 0))`,
    is_radiant: "toInt32(ifNull(player_slot, 0) < 128)",
  };
  const catTuples = countsCats.map((cat) => `('${cat}', ${catExprs[cat]})`);
  const rows = await clickhouse.query<{
    cat: (typeof countsCats)[number];
    k: number;
    games: number;
    win: number;
  }>(`
    SELECT
      pair.1 AS cat,
      pair.2 AS k,
      toInt32(count()) AS games,
      toInt32(countIf(win)) AS win
    FROM (
      SELECT
        ${winExpr} AS win,
        arrayJoin([${catTuples.join(", ")}]) AS pair
      FROM (${sub})
    )
    GROUP BY cat, k
  `);
  for (const r of rows) {
    result[r.cat][r.k] = {
      games: Number(r.games),
      win: Number(r.win),
    };
  }
  return result;
}

export async function getPlayerHistogram(
  accountId: number,
  queryObj: QueryObj,
  field: (typeof histogramCols)[number],
): Promise<{ x: number; games: number; win: number }[]> {
  const buckets = 40;
  if (
    !accountId ||
    !Number.isInteger(accountId) ||
    accountId <= 0 ||
    queryObj.isPrivate
  ) {
    return Array.from({ length: buckets }, (_, index) => ({
      x: 0,
      games: 0,
      win: 0,
    }));
  }
  redisCount("player_matches");
  const sub = await buildPlayerQuery(accountId, queryObj, [
    field,
    "player_slot",
    "radiant_win",
  ]);
  const winExpr =
    "((ifNull(player_slot, 0) < 128) = ifNull(radiant_win, false))";
  const rows = await clickhouse.query<{
    cnt: number;
    max_val: number | null;
    vals: number[];
    wins: number[];
  }>(`
    SELECT
      toInt32(count()) AS cnt,
      max(ifNull(toFloat64(${field}), 0)) AS max_val,
      groupArrayIf(toFloat64(${field}), isNotNull(${field})) AS vals,
      groupArrayIf(toUInt8(${winExpr}), isNotNull(${field})) AS wins
    FROM (${sub})
  `);
  const row = rows[0];
  const cnt = Number(row?.cnt ?? 0);
  if (cnt === 0) {
    return Array.from({ length: buckets }, () => ({
      x: null as any,
      games: 0,
      win: 0,
    }));
  }
  const maxVal = Number(row?.max_val ?? 0);
  const bucketSize = Math.ceil((maxVal + 1) / buckets);
  const bucketArray = Array.from({ length: buckets }, (_, index) => ({
    x: bucketSize * index,
    games: 0,
    win: 0,
  }));
  if (bucketSize <= 0) {
    return bucketArray;
  }
  const vals = row?.vals ?? [];
  const wins = row?.wins ?? [];
  for (let i = 0; i < vals.length; i++) {
    const idx = Math.floor(vals[i] / bucketSize);
    if (bucketArray[idx]) {
      bucketArray[idx].games += 1;
      bucketArray[idx].win += Number(wins[i]);
    }
  }
  return bucketArray;
}

export async function getPlayerHeroes(
  accountId: number,
  queryObj: QueryObj,
): Promise<AnyDict[]> {
  const counts: AnyDict = {};
  Object.keys(heroes).forEach((heroId) => {
    const hero_id_int = parseInt(heroId);
    counts[hero_id_int] = {
      hero_id: hero_id_int,
      last_played: 0,
      games: 0,
      win: 0,
      with_games: 0,
      with_win: 0,
      against_games: 0,
      against_win: 0,
    };
  });
  if (
    accountId &&
    Number.isInteger(accountId) &&
    accountId > 0 &&
    !queryObj.isPrivate
  ) {
    redisCount("player_matches");
    const sub = await buildPlayerQuery(accountId, queryObj, [
      "account_id",
      "start_time",
      "player_slot",
      "radiant_win",
      "heroes",
    ]);
    const rows = await clickhouse.query<{
      tm_hero: number;
      last_played: number;
      games: number;
      win: number;
      with_games: number;
      with_win: number;
      against_games: number;
      against_win: number;
    }>(`
      SELECT
        JSONExtractInt(kv.2, 'hero_id') AS tm_hero,
        toInt64(maxIf(ifNull(start_time, 0), same_team AND is_self)) AS last_played,
        toInt32(countIf(same_team AND is_self)) AS games,
        toInt32(countIf(same_team AND is_self AND player_win)) AS win,
        toInt32(countIf(same_team AND NOT is_self)) AS with_games,
        toInt32(countIf(same_team AND NOT is_self AND player_win)) AS with_win,
        toInt32(countIf(NOT same_team)) AS against_games,
        toInt32(countIf(NOT same_team AND player_win)) AS against_win
      FROM (
        SELECT
          account_id,
          start_time,
          ((ifNull(player_slot, 0) < 128) = ifNull(radiant_win, false)) AS player_win,
          (ifNull(player_slot, 0) < 128) AS player_rad,
          arrayJoin(JSONExtractKeysAndValuesRaw(ifNull(heroes, '{}'))) AS kv,
          ((toInt32OrZero(kv.1) < 128) = player_rad) AS same_team,
          (JSONExtractInt(kv.2, 'account_id') = account_id) AS is_self
        FROM (${sub})
      )
      GROUP BY tm_hero
    `);
    for (const r of rows) {
      if (r.tm_hero in counts) {
        counts[r.tm_hero].last_played = Number(r.last_played);
        counts[r.tm_hero].games = Number(r.games);
        counts[r.tm_hero].win = Number(r.win);
        counts[r.tm_hero].with_games = Number(r.with_games);
        counts[r.tm_hero].with_win = Number(r.with_win);
        counts[r.tm_hero].against_games = Number(r.against_games);
        counts[r.tm_hero].against_win = Number(r.against_win);
      }
    }
  }
  return Object.keys(counts)
    .map((k) => counts[k])
    .filter(
      (hero) => !queryObj.having || hero.games >= Number(queryObj.having),
    )
    .sort((a, b) => b.games - a.games);
}

export async function getPlayerPeersCount(
  accountId: number,
  queryObj: QueryObj,
): Promise<PeersCount> {
  const teammates: PeersCount = {};
  if (
    !accountId ||
    !Number.isInteger(accountId) ||
    accountId <= 0 ||
    queryObj.isPrivate
  ) {
    return teammates;
  }
  redisCount("player_matches");
  const sub = await buildPlayerQuery(accountId, queryObj, [
    "start_time",
    "gold_per_min",
    "xp_per_min",
    "player_slot",
    "radiant_win",
    "heroes",
  ]);
  const rows = await clickhouse.query<{
    peer_id: number;
    last_played: number;
    win: number;
    games: number;
    with_win: number;
    with_games: number;
    against_win: number;
    against_games: number;
    with_gpm_sum: number;
    with_xpm_sum: number;
  }>(`
    SELECT
      JSONExtractInt(kv.2, 'account_id') AS peer_id,
      toInt64(max(ifNull(start_time, 0))) AS last_played,
      toInt32(countIf(player_win)) AS win,
      toInt32(count()) AS games,
      toInt32(countIf(same_team AND player_win)) AS with_win,
      toInt32(countIf(same_team)) AS with_games,
      toInt32(countIf(NOT same_team AND player_win)) AS against_win,
      toInt32(countIf(NOT same_team)) AS against_games,
      toInt64(sumIf(ifNull(gold_per_min, 0), same_team)) AS with_gpm_sum,
      toInt64(sumIf(ifNull(xp_per_min, 0), same_team)) AS with_xpm_sum
    FROM (
      SELECT
        start_time,
        gold_per_min,
        xp_per_min,
        ((ifNull(player_slot, 0) < 128) = ifNull(radiant_win, false)) AS player_win,
        (ifNull(player_slot, 0) < 128) AS player_rad,
        arrayJoin(JSONExtractKeysAndValuesRaw(ifNull(heroes, '{}'))) AS kv,
        ((toInt32OrZero(kv.1) < 128) = player_rad) AS same_team
      FROM (${sub})
    )
    WHERE peer_id > 0
    GROUP BY peer_id
  `);
  for (const r of rows) {
    teammates[r.peer_id] = {
      account_id: Number(r.peer_id),
      last_played: Number(r.last_played),
      win: Number(r.win),
      games: Number(r.games),
      with_win: Number(r.with_win),
      with_games: Number(r.with_games),
      against_win: Number(r.against_win),
      against_games: Number(r.against_games),
      with_gpm_sum: Number(r.with_gpm_sum),
      with_xpm_sum: Number(r.with_xpm_sum),
    };
  }
  return teammates;
}

export async function getPlayerWordcloud(
  accountId: number,
  queryObj: QueryObj,
): Promise<Record<(typeof wordcloudCols)[number], AnyDict>> {
  const result = {
    all_word_counts: {},
    my_word_counts: {},
  };
  if (
    !accountId ||
    !Number.isInteger(accountId) ||
    accountId <= 0 ||
    queryObj.isPrivate
  ) {
    return result;
  }
  redisCount("player_matches");
  const sub = await buildPlayerQuery(accountId, queryObj, wordcloudCols);
  const rows = await clickhouse.query<{
    all_word_counts: AnyDict;
    my_word_counts: AnyDict;
  }>(`
    SELECT
      sumMap(JSONExtract(ifNull(all_word_counts, '{}'), 'Map(String, Int64)')) AS all_word_counts,
      sumMap(JSONExtract(ifNull(my_word_counts, '{}'), 'Map(String, Int64)')) AS my_word_counts
    FROM (${sub})
  `);
  return {
    all_word_counts: rows[0]?.all_word_counts ?? {},
    my_word_counts: rows[0]?.my_word_counts ?? {},
  };
}

export async function getPlayerWardmap(
  accountId: number,
  queryObj: QueryObj,
): Promise<Record<(typeof wardmapCols)[number], AnyDict>> {
  const result: Record<(typeof wardmapCols)[number], AnyDict> = {
    obs: {},
    sen: {},
  };
  if (
    !accountId ||
    !Number.isInteger(accountId) ||
    accountId <= 0 ||
    queryObj.isPrivate
  ) {
    return result;
  }
  redisCount("player_matches");
  const obsSub = await buildPlayerQuery(accountId, queryObj, ["obs"]);
  const senSub = await buildPlayerQuery(accountId, queryObj, ["sen"]);
  const rows = await clickhouse.query<{
    kind: "obs" | "sen";
    x: string;
    y: string;
    cnt: number;
  }>(`
    SELECT 'obs' AS kind, x_kv.1 AS x, y_kv.1 AS y, toInt32(sum(toInt64OrZero(y_kv.2))) AS cnt
    FROM (
      SELECT arrayJoin(JSONExtractKeysAndValuesRaw(ifNull(obs, '{}'))) AS x_kv
      FROM (${obsSub})
      WHERE isNotNull(obs) AND obs != '{}'
    )
    ARRAY JOIN JSONExtractKeysAndValuesRaw(x_kv.2) AS y_kv
    GROUP BY x, y
    UNION ALL
    SELECT 'sen' AS kind, x_kv.1 AS x, y_kv.1 AS y, toInt32(sum(toInt64OrZero(y_kv.2))) AS cnt
    FROM (
      SELECT arrayJoin(JSONExtractKeysAndValuesRaw(ifNull(sen, '{}'))) AS x_kv
      FROM (${senSub})
      WHERE isNotNull(sen) AND sen != '{}'
    )
    ARRAY JOIN JSONExtractKeysAndValuesRaw(x_kv.2) AS y_kv
    GROUP BY x, y
  `);
  for (const r of rows) {
    if (!result[r.kind][r.x]) {
      result[r.kind][r.x] = {};
    }
    result[r.kind][r.x][r.y] = Number(r.cnt);
  }
  return result;
}
