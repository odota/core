/**
 * Provides utility functions.
 * All functions should have external dependencies (DB, etc.) self-contained.
 * A bare Node installation should be able to require() this file without errors.
 **/
const config = require('../config');
const constants = require('dotaconstants');
const request = require('request');
const BigNumber = require('big-number');
const urllib = require('url');
const laneMappings = require('./laneMappings');

/**
 * Tokenizes an input string.
 *
 * @param {String} Input
 *
 * @return {Array}
 */
function tokenize(input) {
  return input.replace(/[^a-zA-Z- ]+/g, '').replace('/ {2,}/', ' ').toLowerCase().split(' ');
}
/**
 * Creates a job object for enqueueing that contains details such as the Steam API endpoint to hit
 **/
function generateJob(type, payload) {
  const api_url = 'http://api.steampowered.com';
  let api_key;
  const opts = {
    api_details() {
      return {
        url: `${api_url}/IDOTA2Match_570/GetMatchDetails/V001/?key=${api_key}&match_id=${payload.match_id}`,
        title: [type, payload.match_id].join(),
        type: 'api',
        payload,
      };
    },
    api_history() {
      return {
        url: `${api_url}/IDOTA2Match_570/GetMatchHistory/V001/?key=${api_key}${payload.account_id ? `&account_id=${payload.account_id}` : ''}${payload.matches_requested ? `&matches_requested=${payload.matches_requested}` : ''}${payload.hero_id ? `&hero_id=${payload.hero_id}` : ''}${payload.leagueid ? `&league_id=${payload.leagueid}` : ''}${payload.start_at_match_id ? `&start_at_match_id=${payload.start_at_match_id}` : ''}`,
        title: [type, payload.account_id].join(),
        type: 'api',
        payload,
      };
    },
    api_summaries() {
      return {
        url: `${api_url}/ISteamUser/GetPlayerSummaries/v0002/?key=${api_key}&steamids=${payload.players.map(p =>
           convert32to64(p.account_id)
        ).join()}`,
        title: [type, payload.summaries_id].join(),
        type: 'api',
        payload,
      };
    },
    api_sequence() {
      return {
        url: `${api_url}/IDOTA2Match_570/GetMatchHistoryBySequenceNum/V001/?key=${api_key}&start_at_match_seq_num=${payload.start_at_match_seq_num}`,
        title: [type, payload.seq_num].join(),
        type: 'api',
      };
    },
    api_heroes() {
      return {
        url: `${api_url}/IEconDOTA2_570/GetHeroes/v0001/?key=${api_key}&language=${payload.language}`,
        title: [type, payload.language].join(),
        type: 'api',
        payload,
      };
    },
    api_items() {
      return {
        url: `${api_url}/IEconDOTA2_570/GetGameItems/v1?key=${api_key}&language=${payload.language}`,
        type: 'api',
      };
    },
    api_leagues() {
      return {
        url: `${api_url}/IDOTA2Match_570/GetLeagueListing/v0001/?key=${api_key}`,
        title: [type].join(),
        type: 'api',
        payload,
      };
    },
    api_skill() {
      return {
        url: `${api_url}/IDOTA2Match_570/GetMatchHistory/v0001/?key=${api_key}&start_at_match_id=${payload.start_at_match_id}&skill=${payload.skill}&hero_id=${payload.hero_id}&min_players=10`,
        title: [type, payload.skill].join(),
        type: 'api',
        payload,
      };
    },
    api_live() {
      return {
        url: `${api_url}/IDOTA2Match_570/GetLiveLeagueGames/v0001/?key=${api_key}`,
        title: [type].join(),
        type: 'api',
        payload,
      };
    },
    api_notable() {
      return {
        url: `${api_url}/IDOTA2Fantasy_570/GetProPlayerList/v1/?key=${api_key}`,
        title: [type].join(),
        type: 'api',
        payload,
      };
    },
    api_teams() {
      return {
        url: `${api_url}/IDOTA2Teams_570/GetTeamInfo/v1/?key=${api_key}&team_id=${payload.team_id}`,
        title: [type].join(),
        type: 'api',
        payload,
      };
    },
    api_item_schema() {
      return {
        url: `${api_url}/IEconItems_570/GetSchemaURL/v1?key=${api_key}`,
        type: 'api',
      };
    },
    api_item_icon() {
      return {
        url: `${api_url}/IEconDOTA2_570/GetItemIconPath/v1?key=${api_key}&iconname=${payload.iconname}`,
        type: 'api',
      };
    },
    parse() {
      return {
        title: [type, payload.match_id].join(),
        type,
        url: payload.url,
        payload,
      };
    },
  };
  return opts[type]();
}
/**
 * A wrapper around HTTP requests that handles:
 * proxying
 * retries/retry delay
 * Injecting API key for Steam API
 * Errors from Steam API
 **/
function getData(url, cb) {
  let u;
  let delay = Number(config.DEFAULT_DELAY);
  let proxyAffinityRange;
  let timeout = 5000;
  if (url.constructor === Array) {
    // select a random element if array
    u = url[Math.floor(Math.random() * url.length)];
  } else if (typeof url === 'object') {
    // options object
    u = url.url;
    delay = url.delay || delay;
    proxyAffinityRange = url.proxyAffinityRange || proxyAffinityRange;
    timeout = url.timeout || timeout;
  } else {
    u = url;
  }
  const parse = urllib.parse(u, true);
  let proxy;
  let steam_api = false;
  if (parse.host === 'api.steampowered.com') {
    steam_api = true;
    // choose an api key to use
    const api_keys = config.STEAM_API_KEY.split(',');
    parse.query.key = api_keys[Math.floor(Math.random() * api_keys.length)];
    parse.search = null;
    /*
    //choose a proxy to request through
    var proxies = config.PROXY_URLS.split(",");
    //add no proxy option
    proxies.push(null);
    proxy = proxies[Math.floor(Math.random() * proxies.length)];
    console.error(proxies, proxy);
    */
    // choose a steam api host
    let api_hosts = config.STEAM_API_HOST.split(',');
    api_hosts = proxyAffinityRange ? api_hosts.slice(0, proxyAffinityRange) : api_hosts;
    parse.host = api_hosts[Math.floor(Math.random() * api_hosts.length)];
  }
  const target = urllib.format(parse);
  console.error('%s - getData: %s', new Date(), target);
  return setTimeout(() => {
    request({
      proxy,
      url: target,
      json: true,
      timeout,
    }, (err, res, body) => {
      if (err || !res || res.statusCode !== 200 || !body || (steam_api && !body.result && !body.response && !body.player_infos && !body.teams)) {
        // invalid response
        if (url.noRetry) {
          return cb(err || 'invalid response');
        } else {
          console.error('[INVALID] status: %s, retrying: %s', res ? res.statusCode : '', target);
          // var backoff = res && res.statusCode === 429 ? delay * 2 : 0;
          const backoff = 0;
          return setTimeout(() => {
            getData(url, cb);
          }, backoff);
        }
      } else if (body.result) {
        // steam api usually returns data with body.result, getplayersummaries has body.response
        if (body.result.status === 15 || body.result.error === 'Practice matches are not available via GetMatchDetails' || body.result.error === 'No Match ID specified' || body.result.error === 'Match ID not found') {
          // user does not have stats enabled or attempting to get private match/invalid id, don't retry
          // non-retryable
          return cb(body);
        } else if (body.result.error || body.result.status === 2) {
          // valid response, but invalid data, retry
          if (url.noRetry) {
            return cb(err || 'invalid data');
          } else {
            console.error('invalid data, retrying: %s, %s', target, JSON.stringify(body));
            return getData(url, cb);
          }
        }
      }
      return cb(null, body, {
        hostname: parse.host,
      });
    });
  }, delay);
}
/*
 * Converts a steamid 64 to a steamid 32
 *
 * Returns a string
 */
function convert64to32(id) {
  return new BigNumber(id).minus('76561197960265728').toString();
}
/*
 * Converts a steamid 64 to a steamid 32
 *
 * Returns a string
 */
function convert32to64(id) {
  return new BigNumber('76561197960265728').plus(id).toString();
}

function isRadiant(player) {
  return player.player_slot < 128;
}

function mergeObjects(merge, val) {
  for (const attr in val) {
    // NaN test
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
  }
}

function mode(array) {
  if (array.length == 0) return null;
  const modeMap = {};
  let maxEl = array[0],
    maxCount = 1;
  for (let i = 0; i < array.length; i++) {
    const el = array[i];
    if (modeMap[el] == null) modeMap[el] = 1;
    else modeMap[el]++;
    if (modeMap[el] > maxCount) {
      maxEl = el;
      maxCount = modeMap[el];
    }
  }
  return maxEl;
}

function isSignificant(m) {
  return Boolean(constants.game_mode[m.game_mode] && constants.game_mode[m.game_mode].balanced && constants.lobby_type[m.lobby_type] && constants.lobby_type[m.lobby_type].balanced && m.radiant_win !== undefined && m.duration > 60 * 5);
}

function max(array) {
  return Math.max.apply(null, array);
}

function min(array) {
  return Math.min.apply(null, array);
}

function getAggs() {
  return {
    account_id: 'api',
    match_id: 'api',
    player_slot: 'api',
    heroes: 'api',
    radiant_win: 'api',
    start_time: 'api',
    duration: 'api',
    cluster: 'api',
    region: 'api',
    patch: 'api',
    lobby_type: 'api',
    game_mode: 'api',
    level: 'api',
    kills: 'api',
    deaths: 'api',
    assists: 'api',
    kda: 'api',
    last_hits: 'api',
    denies: 'api',
    hero_damage: 'api',
    tower_damage: 'api',
    hero_healing: 'api',
    gold_per_min: 'api',
    xp_per_min: 'api',
    hero_id: 'api',
    leaver_status: 'api',
    version: 'parsed',
    courier_kills: 'parsed',
    tower_kills: 'parsed',
    neutral_kills: 'parsed',
    lane: 'parsed',
    lane_role: 'parsed',
    obs: 'parsed',
    sen: 'parsed',
    item_uses: 'parsed',
    purchase_time: 'parsed',
    item_usage: 'parsed',
    item_win: 'parsed',
    purchase: 'parsed',
    multi_kills: 'parsed',
    kill_streaks: 'parsed',
    all_word_counts: 'parsed',
    my_word_counts: 'parsed',
    throw: 'parsed',
    comeback: 'parsed',
    stomp: 'parsed',
    loss: 'parsed',
    actions_per_min: 'parsed',
    purchase_ward_observer: 'parsed',
    purchase_ward_sentry: 'parsed',
    purchase_tpscroll: 'parsed',
    purchase_rapier: 'parsed',
    purchase_gem: 'parsed',
    pings: 'parsed',
    stuns: 'parsed',
    lane_efficiency_pct: 'parsed',
    skill: 'skill',
  };
}
// reduce match to only fields needed for aggregation/filtering
function reduceAggregable(pm) {
  const result = {};
  for (const key in getAggs()) {
    result[key] = pm[key];
  }
  return result;
}
/**
 * Serializes a JSON object to row for storage in Cassandra
 **/
function serialize(row) {
  const obj = {};
  for (const key in row) {
    if (row[key] !== null && !Number.isNaN(row[key]) && row[key] !== undefined) {
      obj[key] = JSON.stringify(row[key]);
    }
  }
  return obj;
}
/**
 * Deserializes a row to JSON object read from Cassandra
 **/
function deserialize(row) {
  const obj = {};
  row.keys().forEach((key) => {
    try {
      obj[key] = JSON.parse(row[key]);
    } catch (e) {
      console.error('exception occurred during JSON parse: %s', e);
    }
  });
  return obj;
}
/**
 * Returns a list of heroes sorted in alphabetical order
 **/
function getAlphaHeroes() {
  const alpha_heroes = Object.keys(constants.heroes).map(id =>
     constants.heroes[id]
  ).sort((a, b) =>
     a.localized_name < b.localized_name ? -1 : 1
  );
  return alpha_heroes;
}
/**
 * Formats a snake_cased string for display
 **/
function prettyPrint(str) {
  return str.split('_').map((s) => {
    switch (s) {
      case 'xp':
        return 'XP';
      case 'kda':
        return 'KDA';
      case 'tpscroll':
        return 'TP Scroll';
      default:
        return s.charAt(0).toUpperCase() + s.slice(1);
    }
  }).join(' ');
}
/**
 * Returns the unix timestamp at the beginning of a block of n minutes
 * Offset controls the number of blocks to look ahead
 **/
function getStartOfBlockMinutes(size, offset) {
  offset = offset || 0;
  const blockS = size * 60;
  const curTime = ~~(new Date() / 1000);
  const blockStart = curTime - (curTime % blockS);
  return (blockStart + (offset * blockS)).toFixed(0);
}

function percentToTextClass(pct) {
  if (pct >= 0.8) {
    return {
      className: 'text-success',
      grade: 'A',
    };
  } else if (pct >= 0.6) {
    return {
      className: 'text-info',
      grade: 'B',
    };
  } else if (pct >= 0.4) {
    return {
      className: 'text-primary',
      grade: 'C',
    };
  } else if (pct >= 0.2) {
    return {
      className: 'text-warning',
      grade: 'D',
    };
  } else {
    return {
      className: 'text-danger',
      grade: 'F',
    };
  }
}

function average(data) {
  return ~~(data.reduce((a, b) =>
     a + b
  , 0) / data.length);
}

function stdDev(data) {
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

function median(data) {
  data.sort((a, b) =>
     a - b
  );
  const half = Math.floor(data.length / 2);
  if (data.length % 2) return data[half];
  else return (data[half - 1] + data[half]) / 2.0;
}

function getPatchIndex(start_time) {
  const date = new Date(start_time * 1000);
  for (var i = 1; i < constants.patch.length; i++) {
    const pd = new Date(constants.patch[i].date);
    // stop when patch date is past the start time
    if (pd > date) {
      break;
    }
  }
  // use the value of i before the break, started at 1 to avoid negative index
  return i - 1;
}

function buildReplayUrl(match_id, cluster, replay_salt) {
  const suffix = config.NODE_ENV === 'test' ? '.dem' : '.dem.bz2';
  return `http://replay${cluster}.valve.net/570/${match_id}_${replay_salt}${suffix}`;
}

function expectedWin(rates) {
  // simple implementation, average
  // return rates.reduce((prev, curr) => prev + curr)) / hids.length;
  // advanced implementation, asymptotic
  // return 1 - rates.reduce((prev, curr) => (1 - curr) * prev, 1) / (Math.pow(50, rates.length-1));
  return 1 - rates.reduce((prev, curr) => (100 - curr * 100) * prev, 1) / (Math.pow(50, rates.length - 1) * 100);
}

function matchupToString(t0, t1, t0win) {
  // create sorted strings of each team
  const rcg = groupToString(t0);
  const dcg = groupToString(t1);
  let suffix = '0';
  if (rcg <= dcg) {
    suffix = t0win ? '0' : '1';
    return `${rcg}:${dcg}:${suffix}`;
  } else {
    suffix = t0win ? '1' : '0';
    return `${dcg}:${rcg}:${suffix}`;
  }
}

function groupToString(g) {
  return g.sort((a, b) =>
     a - b
  ).join(',');
}

function kCombinations(arr, k) {
  let i,
    j,
    combs,
    head,
    tailcombs;
  if (k > arr.length || k <= 0) {
    return [];
  }
  if (k === arr.length) {
    return [arr];
  }
  if (k == 1) {
    combs = [];
    for (i = 0; i < arr.length; i++) {
      combs.push([arr[i]]);
    }
    return combs;
  }
  // Assert {1 < k < arr.length}
  combs = [];
  for (i = 0; i < arr.length - k + 1; i++) {
    head = arr.slice(i, i + 1);
    // recursively get all combinations of the remaining array
    tailcombs = kCombinations(arr.slice(i + 1), k - 1);
    for (j = 0; j < tailcombs.length; j++) {
      combs.push(head.concat(tailcombs[j]));
    }
  }
  return combs;
}

function generateMatchups(match, max) {
  max = max || 5;
  const radiant = [];
  const dire = [];
  // start with empty arrays for the choose 0 case
  let rCombs = [
    [],
  ];
  let dCombs = [
    [],
  ];
  const result = [];
  for (var i = 0; i < match.players.length; i++) {
    const p = match.players[i];
    if (p.hero_id === 0) {
      // exclude this match if any hero is 0
      return;
    }
    if (isRadiant(p)) {
      radiant.push(p.hero_id);
    } else {
      dire.push(p.hero_id);
    }
  }
  for (var i = 1; i < (max + 1); i++) {
    const rc = kCombinations(radiant, i);
    const dc = kCombinations(dire, i);
    rCombs = rCombs.concat(rc);
    dCombs = dCombs.concat(dc);
  }
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
  return result;
}

function countPeers(matches) {
  const teammates = {};
  matches.forEach((m) => {
    const player_win = isRadiant(m) === m.radiant_win;
    const group = m.heroes || {};
    for (const key in group) {
      const tm = group[key];
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
        };
      }
      if (m.start_time > teammates[tm.account_id].last_played) {
        teammates[tm.account_id].last_played = m.start_time;
      }
      // played with
      teammates[tm.account_id].games += 1;
      teammates[tm.account_id].win += player_win ? 1 : 0;
      if (isRadiant(tm) === isRadiant(m)) {
        // played with
        teammates[tm.account_id].with_games += 1;
        teammates[tm.account_id].with_win += player_win ? 1 : 0;
      } else {
        // played against
        teammates[tm.account_id].against_games += 1;
        teammates[tm.account_id].against_win += player_win ? 1 : 0;
      }
    }
  });
  return teammates;
}

function getAnonymousAccountId() {
  return 4294967295;
}

function getLevelFromXp(xp) {
  for (let i = 0; i < constants.xp_level.length; i++) {
    if (constants.xp_level[i] > xp) {
      return i;
    }
  }
  return constants.xp_level.length;
}

function getLaneFromPosData(lane_pos, isRadiant) {
  // compute lanes
  const lanes = [];
  // iterate over the position hash and get the lane bucket for each data point
  Object.keys(lane_pos).forEach((x) => {
    Object.keys(lane_pos[x]).forEach((y) => {
      const val = lane_pos[x][y];
      const adjX = Number(x) - 64;
      const adjY = 127 - (Number(y) - 64);
      // Add it N times to the array
      for (let i = 0; i < val; i += 1) {
        lanes.push(laneMappings[adjY][adjX]);
      }
    });
  });
  const lane = mode(lanes);
  const laneRoles = {
    1() {
      // bot
      return isRadiant ? 1 : 3;
    },
    2() {
      // mid
      return 2;
    },
    3() {
      // top
      return isRadiant ? 3 : 1;
    },
    4() {
      // rjung
      return 4;
    },
    5() {
      // djung
      return 4;
    },
  };
  return { 
    lane,
    lane_role: laneRoles[lane] ? laneRoles[lane]() : null,
  }
}

module.exports = {
  tokenize,
  generateJob,
  getData,
  convert32to64,
  convert64to32,
  isRadiant,
  mergeObjects,
  mode,
  isSignificant,
  max,
  min,
  getAggs,
  reduceAggregable,
  serialize,
  getAlphaHeroes,
  prettyPrint,
  getStartOfBlockMinutes,
  percentToTextClass,
  average,
  stdDev,
  median,
  deserialize,
  getPatchIndex,
  buildReplayUrl,
  expectedWin,
  matchupToString,
  groupToString,
  kCombinations,
  generateMatchups,
  countPeers,
  getAnonymousAccountId,
  getLevelFromXp,
  getLaneFromPosData,
};
