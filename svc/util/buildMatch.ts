import { heroes } from "dotaconstants";
import config from "../../config.ts";
import {
  annotateFirstbloodVictim,
  computeMatchData,
  estimatePositions,
} from "./compute.ts";
import { buildReplayUrl, isTurbo } from "./utility.ts";
import redis, { redisCount } from "../store/redis.ts";
import db from "../store/db.ts";
import { benchmarks } from "./benchmarksUtil.ts";
import * as allFetchers from "../fetcher/allFetchers.ts";
import { getMatchBlob } from "./getMatchBlob.ts";
import { getStartOfBlockMinutes } from "./time.ts";
import { getMatchRankTier } from "./queries.ts";
import { isContributor } from "../../CONTRIBUTORS.ts";

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

type ProMatchInfo = {
  radiant_team?: any;
  dire_team?: any;
  league?: any;
  series_id?: number;
  series_type?: number;
  replay_salt?: number;
};

async function getProMatchInfo(match: Match): Promise<ProMatchInfo> {
  const resultPromise = match.leagueid
    ? db
        .query(
          "SELECT series_id, series_type, replay_salt FROM matches WHERE match_id = $1",
          [match.match_id],
        )
        .then((r) => r.rows[0])
    : Promise.resolve(undefined);
  const leaguePromise = match.leagueid
    ? db
        .query("SELECT * FROM leagues WHERE leagueid = $1", [match.leagueid])
        .then((r) => r.rows[0])
    : Promise.resolve(undefined);
  const radiantTeamPromise =
    "radiant_team_id" in match
      ? db
          .query("SELECT * FROM teams WHERE team_id = $1", [
            match.radiant_team_id,
          ])
          .then((r) => r.rows[0])
      : Promise.resolve(undefined);
  const direTeamPromise =
    "dire_team_id" in match
      ? db
          .query("SELECT * FROM teams WHERE team_id = $1", [match.dire_team_id])
          .then((r) => r.rows[0])
      : Promise.resolve(undefined);
  const [result, league, radiantTeam, direTeam] = await Promise.all([
    resultPromise,
    leaguePromise,
    radiantTeamPromise,
    direTeamPromise,
  ]);
  const final: ProMatchInfo = {};
  if (result) {
    final.series_id = result.series_id;
    final.series_type = result.series_type;
    final.replay_salt = result.replay_salt;
  }
  if (league) {
    final.league = league;
  }
  if (radiantTeam) {
    final.radiant_team = radiantTeam;
  }
  if (direTeam) {
    final.dire_team = direTeam;
  }
  return final;
}

/**
 * Adds benchmark data to the players in a match
 * */
export async function getPlayerBenchmarks(m: Match) {
  const turbo = isTurbo(m);
  // Bracket 1-8 from the average rank of the players, matching what the
  // write side does in counts.ts (turbo only has global benchmarks)
  const { avg } = turbo ? { avg: null } : await getMatchRankTier(db, m.players);
  const bracket = avg ? Math.floor(avg / 10) : null;
  const retention = Number(config.BENCHMARK_RETENTION_MINUTES);
  const prevBlock = getStartOfBlockMinutes(retention, -1);
  const currBlock = getStartOfBlockMinutes(retention, 0);
  const turboSuffix = turbo ? "turbo" : "";
  const metricNames = Object.keys(benchmarks);

  // Collect all (key, raw) pairs to evaluate in a single SQL query
  const queryKeys: string[] = [];
  const queryRaws: (number | null)[] = [];
  const seenPairs = new Set<string>();
  const addPair = (key: string, raw: number | null) => {
    const dedupKey = `${key}\0${raw}`;
    if (!seenPairs.has(dedupKey)) {
      seenPairs.add(dedupKey);
      queryKeys.push(key);
      queryRaws.push(raw);
    }
  };

  const playerMetrics = m.players.map((p) => {
    const entries: {
      metric: string;
      raw: number | undefined;
      numRaw: number | null;
      primaryKey: string;
      backupKey: string;
    }[] = [];
    for (const metric of metricNames) {
      const raw = benchmarks[metric](m, p);
      const numRaw =
        raw !== undefined && raw !== null && !Number.isNaN(Number(raw))
          ? Number(raw)
          : null;
      const primaryKey = [
        "benchmarks",
        prevBlock,
        metric,
        p.hero_id,
        turboSuffix,
      ].join(":");
      const backupKey = [
        "benchmarks",
        currBlock,
        metric,
        p.hero_id,
        turboSuffix,
      ].join(":");
      addPair(primaryKey, numRaw);
      addPair(backupKey, numRaw);
      if (bracket) {
        addPair(`${primaryKey}:${bracket}`, numRaw);
        addPair(`${backupKey}:${bracket}`, numRaw);
      }
      entries.push({ metric, raw, numRaw, primaryKey, backupKey });
    }
    return entries;
  });

  const statsMap = new Map<string, { card: number; count: number }>();
  if (queryKeys.length) {
    const now = Math.floor(Date.now() / 1000);
    const { rows } = await db.query(
      `SELECT
         q.key,
         q.raw,
         count(z.member)::int AS card,
         count(z.member) FILTER (WHERE q.raw IS NOT NULL AND z.score >= 0 AND z.score <= q.raw)::int AS cnt
       FROM unnest($1::text[], $2::double precision[]) AS q(key, raw)
       LEFT JOIN kv_zset z
         ON z.key = q.key AND (z.expires_at IS NULL OR z.expires_at > $3)
       GROUP BY q.key, q.raw`,
      [queryKeys, queryRaws, now],
    );
    for (const r of rows) {
      statsMap.set(`${r.key}\0${r.raw === null ? null : Number(r.raw)}`, {
        card: Number(r.card),
        count: Number(r.cnt),
      });
    }
  }

  return playerMetrics.map((entries) => {
    const result: Record<
      string,
      { raw?: number; pct?: number; pct_bracket?: number }
    > = {};
    for (const { metric, raw, numRaw, primaryKey, backupKey } of entries) {
      result[metric] = { raw };
      const primaryStats = statsMap.get(`${primaryKey}\0${numRaw}`);
      const usePrimary = Boolean(primaryStats && primaryStats.card > 0);
      const chosenKey = usePrimary ? primaryKey : backupKey;
      const chosenStats = statsMap.get(`${chosenKey}\0${numRaw}`) ?? {
        card: 0,
        count: 0,
      };
      if (numRaw !== null) {
        const pct =
          metric === "deaths_per_min"
            ? 1 - chosenStats.count / chosenStats.card
            : chosenStats.count / chosenStats.card;
        result[metric].pct = pct;
        if (bracket) {
          const bracketStats = statsMap.get(
            `${chosenKey}:${bracket}\0${numRaw}`,
          );
          if (bracketStats && bracketStats.card > 0) {
            result[metric].pct_bracket =
              metric === "deaths_per_min"
                ? 1 - bracketStats.count / bracketStats.card
                : bracketStats.count / bracketStats.card;
          }
        }
      }
    }
    return result;
  });
}

async function getPlayerDetails(match: Match | ParsedMatch) {
  const accountIds = match.players.map((p) => p.account_id ?? null).filter(Boolean);

  const { rows } = await db.query(
    `
    SELECT players.account_id, personaname, name, last_login, rating, status, computed_mmr
    FROM players
    LEFT JOIN notable_players USING(account_id)
    LEFT JOIN rank_tier USING(account_id)
    LEFT JOIN player_computed_mmr USING(account_id)
    LEFT JOIN subscriber USING(account_id)
    WHERE players.account_id = ANY($1)
  `,
    [accountIds],
  );

  const rowsByAccountId = new Map<number | undefined, AnyDict>(rows.map((row: AnyDict) => [row.account_id, row]));

  return match.players.map((p) => {
    const row = rowsByAccountId.get(p.account_id);
    return {
      ...p,
      personaname: row?.personaname,
      name: row?.name,
      last_login: row?.last_login,
      rank_tier: row?.rating,
      computed_mmr: row?.computed_mmr,
      is_subscriber: Boolean(row?.status),
    };
  });
}

async function getCosmetics(match: Match | ParsedMatch) {
  if ("cosmetics" in match && match.cosmetics) {
    return Promise.all(
      Object.keys(match.cosmetics).map((itemId) =>
        db
          .query("SELECT * FROM cosmetics WHERE item_id = $1", [itemId])
          .then((r) => r.rows[0]),
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
  options: { meta?: boolean },
): Promise<Match | ParsedMatch | null> {
  if (!matchId || !Number.isInteger(matchId) || matchId <= 0) {
    return null;
  }

  // track distribution of matches requested
  // const bucket = Math.floor(matchId / 1000000000);
  // redisCount((bucket + '_match_req') as MetricName);
  redisCount("build_match");

  // Check for cache
  const key = `match:${matchId}`;
  const reply = await redis.get(key);
  if (reply) {
    redisCount("match_cache_hit");
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
              "cosmetics" in match &&
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
  estimatePositions(matchResult.players as ParsedPlayerMatch[]);
  annotateFirstbloodVictim(matchResult);

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
