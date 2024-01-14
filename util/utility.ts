import constants from 'dotaconstants';
import request from 'request';
import urllib from 'url';
import moment from 'moment';
import crypto from 'crypto';
import laneMappings from './laneMappings';
import config from '../config';
import contributors from '../CONTRIBUTORS';
import { promisify } from 'util';
import type { Redis } from 'ioredis';
import type { ApiMatch } from '../store/pgroup';
import type QueryString from 'qs';

/**
 * Tokenizes an input string.
 *
 * @param {String} Input
 *
 * @return {Array}
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
 *
 * Takes and returns a string
 */
export function convert64to32(id: string) {
  return (BigInt(id) - BigInt('76561197960265728')).toString();
}
/*
 * Converts a steamid 64 to a steamid 32
 *
 * Takes and returns a string
 */
export function convert32to64(id: string) {
  return (BigInt(id) + BigInt('76561197960265728')).toString();
}
/**
 * Helper to generate Steam API URLs
 * */
export function generateJob(type: SteamEndpointType, payload: any) {
  return jobs[type](type, payload);
}
type SteamEndpointType = keyof typeof jobs;
const apiUrl = 'http://api.steampowered.com';
let apiKey = config.STEAM_API_KEY.split(',')[0];
const jobs = {
  api_details(type: string, payload: { match_id: string | number }) {
    return {
      url: `${apiUrl}/IDOTA2Match_570/GetMatchDetails/V001/?key=${apiKey}&match_id=${payload.match_id}`,
      title: [type, payload.match_id].join(),
      type: 'api',
      payload,
    };
  },
  api_history(type: string, payload: any) {
    return {
      url: `${apiUrl}/IDOTA2Match_570/GetMatchHistory/V001/?key=${apiKey}${
        payload.account_id ? `&account_id=${payload.account_id}` : ''
      }${
        payload.matches_requested
          ? `&matches_requested=${payload.matches_requested}`
          : ''
      }${payload.hero_id ? `&hero_id=${payload.hero_id}` : ''}${
        payload.leagueid ? `&league_id=${payload.leagueid}` : ''
      }${
        payload.start_at_match_id
          ? `&start_at_match_id=${payload.start_at_match_id}`
          : ''
      }`,
      title: [type, payload.account_id].join(),
      type: 'api',
      payload,
    };
  },
  api_summaries(type: string, payload: any) {
    return {
      url: `${apiUrl}/ISteamUser/GetPlayerSummaries/v0002/?key=${apiKey}&steamids=${payload.players
        .map((p: Player) => convert32to64(String(p.account_id)))
        .join()}`,
      title: [type, payload.summaries_id].join(),
      type: 'api',
      payload,
    };
  },
  api_sequence(type: string, payload: any) {
    return {
      url: `${apiUrl}/IDOTA2Match_570/GetMatchHistoryBySequenceNum/V001/?key=${apiKey}&start_at_match_seq_num=${payload.start_at_match_seq_num}`,
      title: [type, payload.seq_num].join(),
      type: 'api',
    };
  },
  api_heroes(type: string, payload: any) {
    return {
      url: `${apiUrl}/IEconDOTA2_570/GetHeroes/v0001/?key=${apiKey}&language=${payload.language}`,
      title: [type, payload.language].join(),
      type: 'api',
      payload,
    };
  },
  api_items(type: string, payload: any) {
    return {
      url: `${apiUrl}/IEconDOTA2_570/GetGameItems/v1?key=${apiKey}&language=${payload.language}`,
      type: 'api',
    };
  },
  api_live(type: string, payload: any) {
    return {
      url: `${apiUrl}/IDOTA2Match_570/GetLiveLeagueGames/v0001/?key=${apiKey}`,
      title: [type].join(),
      type: 'api',
      payload,
    };
  },
  api_teams(type: string, payload: any) {
    return {
      url: `${apiUrl}/IDOTA2Teams_570/GetTeamInfo/v1/?key=${apiKey}&team_id=${payload.team_id}`,
      title: [type].join(),
      type: 'api',
      payload,
    };
  },
  api_item_schema(type: string, payload: any) {
    return {
      url: `${apiUrl}/IEconItems_570/GetSchemaURL/v1?key=${apiKey}`,
      type: 'api',
    };
  },
  api_top_live_game(type: string, payload: any) {
    return {
      url: `${apiUrl}/IDOTA2Match_570/GetTopLiveGame/v1/?key=${apiKey}&partner=0`,
      type: 'api',
    };
  },
  api_realtime_stats(type: string, payload: any) {
    return {
      url: `${apiUrl}/IDOTA2MatchStats_570/GetRealtimeStats/v1?key=${apiKey}&server_steam_id=${payload.server_steam_id}`,
      type: 'api',
    };
  },
  api_team_info_by_team_id(type: string, payload: any) {
    return {
      url: `${apiUrl}/IDOTA2Match_570/GetTeamInfoByTeamID/v1?key=${apiKey}&start_at_team_id=${payload.start_at_team_id}&teams_requested=1`,
      type: 'api',
    };
  },
  api_get_ugc_file_details(type: string, payload: any) {
    return {
      url: `${apiUrl}/ISteamRemoteStorage/GetUGCFileDetails/v1/?key=${apiKey}&appid=570&ugcid=${payload.ugcid}`,
      type: 'api',
    };
  },
};
/**
 * A wrapper around HTTP requests that handles:
 * proxying
 * retries/retry delay
 * Injecting API key for Steam API
 * Errors from Steam API
 * */
type GetDataOptions = {
  url: string;
  delay?: number;
  timeout?: number;
  raw?: boolean;
  noRetry?: boolean;
  proxy?: boolean;
};
function getSteamAPIDataCallback(url: string | GetDataOptions, cb: ErrorCb) {
  let u: string;
  let timeout = 5000;
  if (typeof url === 'object' && url && url.url) {
    u = url.url;
    timeout = url.timeout || timeout;
  } else {
    u = url as string;
  }
  const isRaw = typeof url === 'object' && url.raw;
  const isNoRetry = typeof url === 'object' && url.noRetry;
  const parse = urllib.parse(u, true);
  const steamApi = parse.host === 'api.steampowered.com';
  if (steamApi) {
    // choose an api key to use
    const apiKeys = config.STEAM_API_KEY.split(',');
    parse.query.key = apiKeys[Math.floor(Math.random() * apiKeys.length)];
    parse.search = null;
    if (typeof url === 'object' && url.proxy) {
      // choose a steam api host
      const apiHosts = config.STEAM_API_HOST.split(',');
      parse.host = apiHosts[Math.floor(Math.random() * apiHosts.length)];
    }
    if (parse.host === 'api.steampowered.com') {
      redisCount(null, 'steam_api_call');
    } else {
      redisCount(null, 'steam_proxy_call');
    }
  }
  const target = urllib.format(parse);
  console.log(target);
  request(
    {
      url: target,
      json: !isRaw,
      gzip: true,
      timeout,
    },
    (err, res, body) => {
      if (
        err ||
        !res ||
        res.statusCode !== 200 ||
        !body ||
        (steamApi &&
          !isRaw &&
          !body.result &&
          !body.response &&
          !body.player_infos &&
          !body.teams &&
          !body.game_list &&
          !body.match &&
          !body.data)
      ) {
        // invalid response
        if (isNoRetry) {
          return cb(err || 'invalid response', body);
        }
        console.error(
          '[INVALID] status: %s, retrying: %s',
          res?.statusCode,
          target,
        );
        if (res?.statusCode === 429) {
          redisCount(null, 'steam_429');
        } else if (res?.statusCode === 403) {
          redisCount(null, 'steam_403');
        }
        const backoff = res?.statusCode === 429 ? 3000 : 1000;
        return setTimeout(() => {
          getSteamAPIDataCallback(url, cb);
        }, backoff);
      }
      if (body.result) {
        // steam api usually returns data with body.result, getplayersummaries has body.response
        if (
          body.result.status === 15 ||
          body.result.error ===
            'Practice matches are not available via GetMatchDetails' ||
          body.result.error === 'No Match ID specified' ||
          body.result.error === 'Match ID not found' ||
          (body.result.status === 2 &&
            body.result.statusDetail === 'Error retrieving match data.' &&
            Math.random() < 0.05)
        ) {
          // private match history or attempting to get practice match/invalid id, don't retry
          // non-retryable
          return cb(body);
        }
        if (body.result.error || body.result.status === 2) {
          // valid response, but invalid data, retry
          if (isNoRetry) {
            return cb(err || 'invalid data', body);
          }
          console.error(
            'invalid data, retrying: %s, %s',
            target,
            JSON.stringify(body),
          );
          const backoff = 1000;
          return setTimeout(() => {
            getSteamAPIDataCallback(url, cb);
          }, backoff);
        }
      }
      return cb(null, body);
    },
  );
}
export const getSteamAPIData = promisify(getSteamAPIDataCallback);
/**
 * Determines if a player is radiant
 * */
export function isRadiant(player: { player_slot: number }) {
  return player.player_slot < 128;
}
/**
 * Determines if a player has contributed to the development of OpenDota
 */
export function isContributor(accountId: string | number) {
  return accountId in contributors;
}
/**
 * Determines if a player won
 * */
export function playerWon(player: Player, match: Match) {
  return player.player_slot < 128 === match.radiant_win;
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
 * Determines if a match is significant for aggregation purposes
 * */
export function isSignificant(match: Match | ApiMatch) {
  return Boolean(
    constants.game_mode[match.game_mode]?.balanced &&
      constants.lobby_type[match.lobby_type]?.balanced &&
      match.radiant_win != null &&
      match.duration > 360 &&
      (match.players || []).every(
        (player) =>
          (player.gold_per_min || 0) < 2500 && Boolean(player.hero_id),
      ),
  );
}
/**
 * Determines if a match is a pro match
 * */
export function isProMatch(match: ApiMatch) {
  return Boolean(
    isSignificant(match) &&
      match.leagueid &&
      match.human_players === 10 &&
      (match.game_mode === 0 ||
        match.game_mode === 1 ||
        match.game_mode === 2) &&
      match.players &&
      match.players.every((player) => player.level > 1) &&
      match.players.every((player) => player.xp_per_min > 0) &&
      match.players.every((player) => player.hero_id > 0),
  );
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
 * Returns the unix timestamp at the beginning of a block of n minutes
 * Offset controls the number of blocks to look ahead
 * */
export function getStartOfBlockMinutes(size: number, offset: number) {
  offset = offset || 0;
  const blockS = size * 60;
  const curTime = Math.floor(Number(new Date()) / 1000);
  const blockStart = curTime - (curTime % blockS);
  return (blockStart + offset * blockS).toFixed(0);
}
export function getEndOfMonth() {
  return moment().endOf('month').unix();
}
export function getEndOfDay() {
  return moment().endOf('day').unix();
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
    (value) => Number(String(value)[0]) * 5 + (value % 10),
  );
  const avgStars = numStars.reduce((a, b) => a + b, 0) / numStars.length;
  return Math.floor(avgStars / 5) * 10 + Math.max(1, Math.round(avgStars % 5));
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
 * Gets the patch ID given a unix start time
 * */
export function getPatchIndex(startTime: number) {
  const date = new Date(startTime * 1000);
  let i;
  for (i = 1; i < constants.patch.length; i += 1) {
    const pd = new Date(constants.patch[i].date);
    // stop when patch date is past the start time
    if (pd > date) {
      break;
    }
  }
  // use the value of i before the break, started at 1 to avoid negative index
  return i - 1;
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
 * Converts a group of heroes to string
 * */
export function groupToString(g: number[]) {
  return g.sort((a, b) => a - b).join(',');
}
/**
 * Serialize a matchup/result of heroes to a string
 * */
export function matchupToString(t0: number[], t1: number[], t0win: boolean) {
  // create sorted strings of each team
  const rcg = groupToString(t0);
  const dcg = groupToString(t1);
  let suffix = '0';
  if (rcg <= dcg) {
    suffix = t0win ? '0' : '1';
    return `${rcg}:${dcg}:${suffix}`;
  }
  suffix = t0win ? '1' : '0';
  return `${dcg}:${rcg}:${suffix}`;
}
/**
 * Enumerates the k-combinations of the input array
 * */
export function kCombinations(arr: number[], k: number): number[][] {
  let i;
  let j;
  let combs;
  let head;
  let tailcombs;
  if (k > arr.length || k <= 0) {
    return [];
  }
  if (k === arr.length) {
    return [arr];
  }
  if (k === 1) {
    combs = [];
    for (i = 0; i < arr.length; i += 1) {
      combs.push([arr[i]]);
    }
    return combs;
  }
  // Assert {1 < k < arr.length}
  combs = [];
  for (i = 0; i < arr.length - k + 1; i += 1) {
    head = arr.slice(i, i + 1);
    // recursively get all combinations of the remaining array
    tailcombs = kCombinations(arr.slice(i + 1), k - 1);
    for (j = 0; j < tailcombs.length; j += 1) {
      combs.push(head.concat(tailcombs[j]));
    }
  }
  return combs;
}
/**
 * Generates an array of the hero matchups in a given match
 * */
export function generateMatchups(match: Match, max: number, oneSided: boolean) {
  max = max || 5;
  const radiant = [];
  const dire = [];
  // start with empty arrays for the choose 0 case
  let rCombs: number[][] = [[]];
  let dCombs: number[][] = [[]];
  const result: string[] = [];
  for (let i = 0; i < match.players.length; i += 1) {
    const p = match.players[i];
    if (p.hero_id === 0) {
      // exclude this match if any hero is 0
      return result;
    }
    if (isRadiant(p)) {
      radiant.push(p.hero_id);
    } else {
      dire.push(p.hero_id);
    }
  }
  for (let i = 1; i < max + 1; i += 1) {
    const rc = kCombinations(radiant, i);
    const dc = kCombinations(dire, i);
    rCombs = rCombs.concat(rc);
    dCombs = dCombs.concat(dc);
  }
  if (oneSided) {
    // For one-sided case, just return all of the team combinations and whether they won or lost
    // Remove the first element
    rCombs.shift();
    dCombs.shift();
    rCombs.forEach((team) => {
      result.push(`${groupToString(team)}:${match.radiant_win ? '1' : '0'}`);
    });
    dCombs.forEach((team) => {
      result.push(`${groupToString(team)}:${match.radiant_win ? '0' : '1'}`);
    });
  } else {
    // iterate over combinations, increment count for unique key
    // include empty set for opposing team (current picks data)
    // t0, t1 are ordered lexicographically
    // format: t0:t1:winner
    // ::0
    // ::1
    // 1::0
    // 1::1
    // 1:2:0
    // when searching, take as input t0, t1 and retrieve data for both values of t0win
    rCombs.forEach((t0) => {
      dCombs.forEach((t1) => {
        const key = matchupToString(t0, t1, match.radiant_win);
        result.push(key);
      });
    });
  }
  return result;
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

export type PeersCount = Record<
  string,
  {
    account_id: number;
    last_played: number;
    win: number;
    games: number;
    with_win: number;
    with_games: number;
    against_win: number;
    against_games: number;
    with_gpm_sum: number;
    with_xpm_sum: number;
  }
>;
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
 * Computes the lane a hero is in based on an input hash of positions
 * */
export function getLaneFromPosData(
  lanePos: Record<string, NumberDict>,
  isRadiant: boolean,
) {
  // compute lanes
  const lanes: number[] = [];
  // iterate over the position hash and get the lane bucket for each data point
  Object.keys(lanePos).forEach((x) => {
    Object.keys(lanePos[x]).forEach((y) => {
      const val = lanePos[x][y];
      const adjX = Number(x) - 64;
      const adjY = 128 - (Number(y) - 64);
      // Add it N times to the array
      for (let i = 0; i < val; i += 1) {
        if (laneMappings[adjY] && laneMappings[adjY][adjX]) {
          lanes.push(laneMappings[adjY][adjX]);
        }
      }
    });
  });
  const { mode: lane, count } = modeWithCount(lanes);
  /**
   * Player presence on lane. Calculated by the count of the prominant
   * lane (`count` of mode) divided by the presence on all lanes (`lanes.length`).
   * Having low presence (<45%) probably means the player is roaming.
   * */
  const isRoaming = (count ?? 0) / lanes.length < 0.45;
  // Roles, currently doesn't distinguish between carry/support in safelane
  // 1 safelane
  // 2 mid
  // 3 offlane
  // 4 jungle
  const laneRoles = {
    // bot
    1: isRadiant ? 1 : 3,
    // mid
    2: 2,
    // top
    3: isRadiant ? 3 : 1,
    // radiant jungle
    4: 4,
    // dire jungle
    5: 4,
  };
  return {
    lane,
    lane_role: laneRoles[lane as keyof typeof laneRoles],
    is_roaming: isRoaming,
  };
}

const RETRIEVER_ARRAY: string[] = makeUrlArray(config.RETRIEVER_HOST);
const PARSER_ARRAY: string[] = makeUrlArray(config.PARSER_HOST);

/**
 * Generate a list of URLs to use for data retrieval. Supports weighting using the size URL query parameter
 * @param input Comma separated URLs
 * @returns Array of URLs
 */
function makeUrlArray(input: string) {
  const output: string[] = [];
  const arr = input.split(',');
  arr.forEach((element) => {
    const parsedUrl = urllib.parse(`http://${element}`, true);
    for (let i = 0; i < (Number(parsedUrl.query.size) || 1); i += 1) {
      output.push(parsedUrl.host as string);
    }
  });
  return output;
}

export function getRetrieverCount() {
  return RETRIEVER_ARRAY.length;
}

/**
 * Return a URL to use for GC data retrieval.
 * @returns
 */
export function getRandomRetrieverUrl(path: string): string {
  const urls = RETRIEVER_ARRAY.map((r) => {
    return `http://${r}${path}?key=${config.RETRIEVER_SECRET}`;
  });
  return urls[Math.floor(Math.random() * urls.length)];
}

export function getRandomParserUrl(replayUrl: string): string {
  const urls = PARSER_ARRAY.map((r) => {
    return `http://${r}/blob?replay_url=${replayUrl}`;
  });
  return urls[Math.floor(Math.random() * urls.length)];
}

export async function getRegistryRetrieverUrl(path: string) {
  const redis = (await import('../store/redis.js')).redis;
  // Purge values older than 10 seconds (stale heartbeat)
  await redis.zremrangebyscore('registry:retriever', '-inf', Date.now() - 10000);
  const hostWithId = await redis.zrandmember('registry:retriever');
  const host = hostWithId?.split('?')[0];
  return `http://${host}${path}?key=${config.RETRIEVER_SECRET}`;
}

/**
 * Increments an hourly Redis counter for the metric
 * @param redis The Redis instance (null to dynamic import the default redis)
 * @param prefix The counter name
 */
export async function redisCount(redis: Redis | null, prefix: MetricName) {
  const redisToUse = redis ?? (await import('../store/redis.js')).redis;
  const key = `${prefix}:v2:${moment().startOf('hour').format('X')}`;
  await redisToUse?.incr(key);
  await redisToUse?.expireat(
    key,
    moment().startOf('hour').add(1, 'day').format('X'),
  );
}

/**
 * invokes a function immediately, waits for callback, waits the delay, and then calls it again
 * Ignores exceptions, but logs them
 * @param func
 * @param delay
 */
export function invokeInterval(func: (cb: ErrorCb) => void, delay: number) {
  (function invoker() {
    console.log('running %s', func.name);
    console.time(func.name);
    return func((err) => {
      if (err) {
        // log the error, but wait until next interval to retry
        console.error(err);
      }
      console.timeEnd(func.name);
      setTimeout(invoker, delay);
    });
  })();
}
/**
 * Same as invokeInterval but for async functions
 * On exceptions, exits the process
 * @param func
 * @param delay
 */
export async function invokeIntervalAsync(
  func: () => Promise<void>,
  delay: number,
) {
  while (true) {
    console.log('running %s', func.name);
    console.time(func.name);
    await func();
    console.timeEnd(func.name);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

/*
 * Promise replacement for async.eachLimit
 * Takes an array of functions that return promises
 * Note this doesn't work on an array of promises as that will start all of them
 */
export async function eachLimitPromise(
  funcs: Array<() => Promise<any>>,
  limit: number,
) {
  let rest = funcs.slice(limit);
  await Promise.all(
    funcs.slice(0, limit).map(async (func) => {
      await func();
      while (rest.length) {
        await rest.shift()?.();
      }
    }),
  );
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
  return Math.floor(Number(new Date()) / (1000 * 60 * 60 * 24 * 7));
}
export function checkIfInExperiment(ip: string, mod: number) {
  return (
    crypto.createHash('md5').update(ip).digest().readInt32BE(0) % 100 < mod
  );
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
      match.players?.[0]?.ability_upgrades_arr,
  );
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
    | string[]
    | QueryString.ParsedQs
    | QueryString.ParsedQs[]
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
