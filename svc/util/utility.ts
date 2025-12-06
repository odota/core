import config from '../../config.ts';
import contributors from '../../CONTRIBUTORS.ts';
import type QueryString from 'qs';
import redis from '../store/redis.ts';

/**
 * Tokenizes an input string.
 */
export function tokenize(input: string) {
  return input
    .replace(/[^a-zа-я- ]+/gi, '')
    .replace('/ {2,}/', ' ')
    .toLowerCase()
    .split(' ');
}

/*
 * Converts a steamid 64 to a steamid 32
 */
export function convert64to32(id: string): string {
  return (BigInt(id) - BigInt('76561197960265728')).toString();
}

/*
 * Converts a steamid 64 to a steamid 32
 */
export function convert32to64(id: string): string {
  return (BigInt(id) + BigInt('76561197960265728')).toString();
}

export function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min) + min);
}

/**
 * Determines if a player has contributed to the development of OpenDota
 */
export function isContributor(accountId: string | number) {
  return accountId in contributors;
}

/**
 * Recursively merges objects that share some keys
 * Numbers get summed
 * Arrays get concatenated
 * Strings get concatenated
 * Objects get recursively merged
 * */
export function mergeObjects(merge: any, val: any) {
  Object.keys(val || {}).forEach((attr) => {
    // check if prop is NaN
    if (Number.isNaN(val[attr])) {
      val[attr] = 0;
    }
    // does property exist?
    if (!merge[attr]) {
      merge[attr] = val[attr];
    } else if (val[attr] && val[attr].constructor === Array) {
      merge[attr] = merge[attr].concat(val[attr]);
    } else if (typeof val[attr] === 'object') {
      mergeObjects(merge[attr], val[attr]);
    } else {
      merge[attr] += Number(val[attr]);
    }
  });
}

/**
 * Finds the mode and its occurrence count in the input array
 * */
export function modeWithCount(array: number[]) {
  if (!array.length) {
    return {};
  }
  const modeMap: NumberDict = {};
  let maxEl = array[0];
  let maxCount = 1;
  for (let i = 0; i < array.length; i += 1) {
    const el = array[i];
    if (modeMap[el] == null) modeMap[el] = 1;
    else modeMap[el] += 1;
    if (modeMap[el] > maxCount) {
      maxEl = el;
      maxCount = modeMap[el];
    }
  }
  return { mode: maxEl, count: maxCount };
}
export function mode(array: number[]) {
  return modeWithCount(array).mode;
}

/**
 * Finds the max of the input array
 * */
export function max(array: number[]) {
  return Math.max.apply(null, array);
}

/**
 * Finds the min of the input array
 * */
export function min(array: number[]) {
  return Math.min.apply(null, array);
}

/**
 * Serializes a JSON object to row for storage in Cassandra
 * */
export function serialize(row: AnyDict): AnyDict {
  const obj: AnyDict = {};
  Object.keys(row).forEach((key) => {
    if (
      row[key] !== null &&
      !Number.isNaN(row[key]) &&
      row[key] !== undefined
    ) {
      obj[key] = JSON.stringify(row[key]);
    }
  });
  return obj;
}

/**
 * Deserializes a row to JSON object read from Cassandra
 * */
export function deserialize(row: AnyDict): any {
  const obj: AnyDict = {};
  const keys = row.keys();
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    obj[key] = JSON.parse(row[key]);
  }
  return obj;
}

/**
 * Finds the arithmetic mean of the input array
 * */
export function average(data: number[]) {
  return Math.floor(data.reduce((a, b) => a + b, 0) / data.length);
}

/**
 * Finds the average rank medal of input array
 * */
export function averageMedal(values: number[]) {
  const numStars = values.map(
    (value) => Number(String(value)[0]) * 5 + (value % 10) - 1,
  );
  const avgStars = Math.round(
    numStars.reduce((a, b) => a + b, 0) / numStars.length,
  );
  return Math.floor(avgStars / 5) * 10 + (avgStars % 5) + 1;
}

/**
 * Finds the standard deviation of the input array
 * */
export function stdDev(data: number[]) {
  const avg = average(data);
  const squareDiffs = data.map((value) => {
    const diff = value - avg;
    const sqrDiff = diff * diff;
    return sqrDiff;
  });
  const avgSquareDiff = average(squareDiffs);
  const stdDev = Math.sqrt(avgSquareDiff);
  return stdDev;
}

/**
 * Finds the median of the input array
 * */
export function median(data: number[]) {
  data.sort((a, b) => a - b);
  const half = Math.floor(data.length / 2);
  if (data.length % 2) {
    return data[half];
  }
  return (data[half - 1] + data[half]) / 2.0;
}

/**
 * Constructs a replay url
 * */
export function buildReplayUrl(
  matchId: number,
  cluster: number,
  replaySalt: number,
  meta?: boolean,
) {
  let suffix = '.dem.bz2';
  if (meta) {
    suffix = '.meta.bz2';
  }
  if (config.NODE_ENV === 'test') {
    return `https://odota.github.io/testfiles/${matchId}_${replaySalt}${suffix.replace(
      '.bz2',
      '',
    )}`;
  } else if (cluster === 236) {
    return `http://replay${cluster}.wmsj.cn/570/${matchId}_${replaySalt}${suffix}`;
  }
  return `http://replay${cluster}.valve.net/570/${matchId}_${replaySalt}${suffix}`;
}

/**
 * Computes the expected winrate given an input array of winrates
 * */
export function expectedWin(rates: number[]) {
  // simple implementation, average
  // return rates.reduce((prev, curr) => prev + curr)) / hids.length;
  // advanced implementation, asymptotic
  // return 1 - rates.reduce((prev, curr) => (1 - curr) * prev, 1) / (Math.pow(50, rates.length-1));
  const adjustedRates = rates.reduce(
    (prev, curr) => (100 - curr * 100) * prev,
    1,
  );
  const denominator = 50 ** (rates.length - 1);
  return 1 - (adjustedRates / denominator) * 100;
}

/**
 * Aggregate popularity of items in the input item array
 */
export function countItemPopularity(items: any[]) {
  // get count of each items
  return items.reduce((acc, item) => {
    acc[item.id] = (acc[item.id] || 0) + 1;
    return acc;
  }, {});
}

/**
 * Counts the peer account_ids in the input match array
 * */
export function countPeers(matches: PlayerMatch[]) {
  const teammates: PeersCount = {};
  matches.forEach((m) => {
    const playerWin = isRadiant(m) === m.radiant_win;
    const group: PGroup = m.heroes || {};
    Object.keys(group).forEach((key) => {
      const tm = group[key];
      if (!tm.account_id) {
        return;
      }
      // count teammate players
      if (!teammates[tm.account_id]) {
        teammates[tm.account_id] = {
          account_id: tm.account_id,
          last_played: 0,
          win: 0,
          games: 0,
          with_win: 0,
          with_games: 0,
          against_win: 0,
          against_games: 0,
          with_gpm_sum: 0,
          with_xpm_sum: 0,
        };
      }
      if (m.start_time > teammates[tm.account_id].last_played) {
        teammates[tm.account_id].last_played = m.start_time;
      }
      // played with
      teammates[tm.account_id].games += 1;
      teammates[tm.account_id].win += playerWin ? 1 : 0;
      if (isRadiant({ player_slot: Number(key) }) === isRadiant(m)) {
        // played with
        teammates[tm.account_id].with_games += 1;
        teammates[tm.account_id].with_win += playerWin ? 1 : 0;
        teammates[tm.account_id].with_gpm_sum += m.gold_per_min;
        teammates[tm.account_id].with_xpm_sum += m.xp_per_min;
      } else {
        // played against
        teammates[tm.account_id].against_games += 1;
        teammates[tm.account_id].against_win += playerWin ? 1 : 0;
      }
    });
  });
  return teammates;
}
/**
 * The anonymous account ID used as a placeholder for player with match privacy settings on
 * */
export function getAnonymousAccountId() {
  return 4294967295;
}

/**
 * Runs an async function on a loop, waiting the delay between each iteration
 * @param func
 * @param delay
 */
export async function runInLoop(func: () => Promise<void>, delay: number) {
  while (true) {
    console.log('running %s', func.name);
    const start = Date.now();
    await func();
    const end = Date.now();
    console.log('%s: %dms', func.name, end - start);
    await redis.setex(
      'lastRun:' + config.APP_NAME,
      config.HEALTH_TIMEOUT,
      end - start,
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

/**
 * Runs a function on each element of an array with the specified concurrency
 */
export async function eachLimitPromise<T>(
  items: T[],
  func: (item: T) => Promise<any>,
  limit: number,
) {
  let cursor = items.entries();
  let numWorkers = limit;
  const results = Array(items.length);
  let count = 0;
  return new Promise((resolve) => {
    Array(numWorkers)
      .fill('')
      .forEach(async () => {
        for (let [i, item] of cursor) {
          try {
            results[i] = await func(item);
          } catch (e) {
            // Log exceptions but keep iterating
            console.log(e);
            results[i] = null;
          }
          count += 1;
        }
        // We'll hit this once per worker, after iteration is complete
        // Only the last one should report results
        if (count === items.length) {
          resolve(results);
        }
      });
  });
}

/**
 * Promise replacement for async.parallel
 * @param obj An object mapping key names to functions returning promises
 */
export async function parallelPromise<T>(
  obj: Record<keyof T, () => Promise<any>>,
): Promise<T> {
  const result = { ...obj } as T;
  await Promise.all(
    Object.entries<() => Promise<any>>(obj).map(async ([key, func]) => {
      const val = await func();
      result[key as keyof T] = val;
      return;
    }),
  );
  return result;
}

/**
 * Returns the current UNIX Epoch time in weeks
 * */
export function epochWeek() {
  return Math.floor(Date.now() / (1000 * 60 * 60 * 24 * 7));
}

/**
 * Picks keys from an object and returns a copy with those keys, with nulls if the property doesn't exist
 * @param obj An object to pick keys from
 * @param keys An array of strings (object property names)
 * @returns
 */
export function pick(obj: any, keys: string[]) {
  const pick: any = {};
  keys.forEach((key) => {
    pick[key] = obj[key] ?? null;
  });
  return pick;
}

export function queryParamToArray(
  input:
    | string
    | QueryString.ParsedQs
    | (string | QueryString.ParsedQs)[]
    | undefined,
): string[] {
  if (Array.isArray(input)) {
    return input as string[];
  }
  if (typeof input === 'string') {
    return [input];
  }
  return [];
}

export function shuffle(array: Array<any>) {
  let currentIndex = array.length;

  // While there remain elements to shuffle...
  while (currentIndex != 0) {
    // Pick a remaining element...
    let randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex],
    ];
  }
}

/**
 * Determines if a player is radiant
 * */
export function isRadiant(player: { player_slot: number }) {
  return player.player_slot < 128;
}

export function isTurbo(match: { game_mode: number }) {
  return match.game_mode === 23;
}

export function isRanked(match: { lobby_type: number }) {
  return match.lobby_type === 7;
}

/**
 * Determines if a player won
 * */
export function playerWon(player: Player, match: Match) {
  return player.player_slot < 128 === match.radiant_win;
}

export function isDataComplete(match: Partial<ParsedMatch>) {
  // Check for fields from API, gcdata, parse
  return Boolean(
    match &&
    match.replay_salt &&
    match.start_time &&
    match.version &&
    match.chat &&
    match.players?.[0]?.hero_damage &&
    // Some players may not have upgrades (DCed or never upgraded abilities), so check all slots
    // If it's ability upgrade expired data none of the players will have it
    // Looks like some ability draft matches also don't have this data (not sure if present in source)
    match.players?.some((p) => p.ability_upgrades_arr),
  );
}