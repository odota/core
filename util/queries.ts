import { items as itemsConstants } from 'dotaconstants';
import config from '../config';
import { teamScenariosQueryParams, metadata } from './scenariosUtil';
import db from '../store/db';
import redis from '../store/redis';
import { benchmarks } from './benchmarksUtil';
import type knex from 'knex';
import type { Request } from 'express';
import {
  getStartOfBlockMinutes,
  countItemPopularity,
  getAnonymousAccountId,
  isContributor,
  averageMedal,
  parallelPromise,
  PeersCount,
} from './utility';
import moment from 'moment';

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
  const purchaseLogs: {
    rows: {
      purchase_log: { key: keyof typeof itemsConstants; time: string }[];
    }[];
  } = await db.raw(
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
    items.filter(
      (item) => item.time <= 0 && item.cost != null && item.cost <= 600,
    ),
  );
  const earlyGameItems = countItemPopularity(
    items.filter(
      (item) =>
        item.time > 0 &&
        item.time < 60 * 10 &&
        item.cost != null &&
        item.cost >= 500,
    ),
  );
  const midGameItems = countItemPopularity(
    items.filter(
      (item) =>
        item.time >= 60 * 10 &&
        item.time < 60 * 25 &&
        item.cost != null &&
        item.cost >= 1000,
    ),
  );
  const lateGameItems = countItemPopularity(
    items.filter(
      (item) => item.time >= 60 * 25 && item.cost != null && item.cost >= 2000,
    ),
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

// For these functions we currently store a fixed number of most recent elements and check for membership
// Since we store the timestamp could change to check if within X days
export async function isRecentVisitor(accountId: number): Promise<boolean> {
  const visitTime = Number(
    await redis.zscore('visitors', accountId.toString()),
  );
  return Boolean(visitTime);
}

export async function isRecentlyVisited(accountId: number): Promise<boolean> {
  const visitTime = Number(
    await redis.zscore('visitedIds', accountId.toString()),
  );
  return Boolean(visitTime);
}
