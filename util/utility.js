/**
 * Provides utility functions.
 * All functions should have external dependencies (DB, etc.) passed as parameters
 * */
const config = require('../config');
const constants = require('dotaconstants');
const request = require('request');
const Long = require('long');
const urllib = require('url');
const uuidV4 = require('uuid/v4');
const moment = require('moment');
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

/*
 * Converts a steamid 64 to a steamid 32
 *
 * Takes and returns a string
 */
function convert64to32(id) {
  return Long.fromString(id).subtract('76561197960265728').toString();
}

/*
 * Converts a steamid 64 to a steamid 32
 *
 * Takes and returns a string
 */
function convert32to64(id) {
  return Long.fromString(id).add('76561197960265728').toString();
}

/**
 * Creates a job object for enqueueing that contains details such as the Steam API endpoint to hit
 * */
function generateJob(type, payload) {
  const apiUrl = 'http://api.steampowered.com';
  let apiKey;
  const opts = {
    api_details() {
      return {
        url: `${apiUrl}/IDOTA2Match_570/GetMatchDetails/V001/?key=${apiKey}&match_id=${payload.match_id}`,
        title: [type, payload.match_id].join(),
        type: 'api',
        payload,
      };
    },
    api_history() {
      return {
        url: `${apiUrl}/IDOTA2Match_570/GetMatchHistory/V001/?key=${apiKey}${payload.account_id ? `&account_id=${payload.account_id}` : ''}${payload.matches_requested ? `&matches_requested=${payload.matches_requested}` : ''}${payload.hero_id ? `&hero_id=${payload.hero_id}` : ''}${payload.leagueid ? `&league_id=${payload.leagueid}` : ''}${payload.start_at_match_id ? `&start_at_match_id=${payload.start_at_match_id}` : ''}`,
        title: [type, payload.account_id].join(),
        type: 'api',
        payload,
      };
    },
    api_summaries() {
      return {
        url: `${apiUrl}/ISteamUser/GetPlayerSummaries/v0002/?key=${apiKey}&steamids=${payload.players.map(p =>
          convert32to64(String(p.account_id))).join()}`,
        title: [type, payload.summaries_id].join(),
        type: 'api',
        payload,
      };
    },
    api_sequence() {
      return {
        url: `${apiUrl}/IDOTA2Match_570/GetMatchHistoryBySequenceNum/V001/?key=${apiKey}&start_at_match_seq_num=${payload.start_at_match_seq_num}`,
        title: [type, payload.seq_num].join(),
        type: 'api',
      };
    },
    api_heroes() {
      return {
        url: `${apiUrl}/IEconDOTA2_570/GetHeroes/v0001/?key=${apiKey}&language=${payload.language}`,
        title: [type, payload.language].join(),
        type: 'api',
        payload,
      };
    },
    api_items() {
      return {
        url: `${apiUrl}/IEconDOTA2_570/GetGameItems/v1?key=${apiKey}&language=${payload.language}`,
        type: 'api',
      };
    },
    api_leagues() {
      return {
        url: `${apiUrl}/IDOTA2Match_570/GetLeagueListing/v0001/?key=${apiKey}&language=${payload.language}`,
        title: [type].join(),
        type: 'api',
        payload,
      };
    },
    api_skill() {
      return {
        url: `${apiUrl}/IDOTA2Match_570/GetMatchHistory/v0001/?key=${apiKey}&start_at_match_id=${payload.start_at_match_id}&skill=${payload.skill}&hero_id=${payload.hero_id}&min_players=10`,
        title: [type, payload.skill].join(),
        type: 'api',
        payload,
      };
    },
    api_live() {
      return {
        url: `${apiUrl}/IDOTA2Match_570/GetLiveLeagueGames/v0001/?key=${apiKey}`,
        title: [type].join(),
        type: 'api',
        payload,
      };
    },
    api_notable() {
      return {
        url: `${apiUrl}/IDOTA2Fantasy_570/GetProPlayerList/v1/?key=${apiKey}`,
        title: [type].join(),
        type: 'api',
        payload,
      };
    },
    api_teams() {
      return {
        url: `${apiUrl}/IDOTA2Teams_570/GetTeamInfo/v1/?key=${apiKey}&team_id=${payload.team_id}`,
        title: [type].join(),
        type: 'api',
        payload,
      };
    },
    api_item_schema() {
      return {
        url: `${apiUrl}/IEconItems_570/GetSchemaURL/v1?key=${apiKey}`,
        type: 'api',
      };
    },
    api_item_icon() {
      return {
        url: `${apiUrl}/IEconDOTA2_570/GetItemIconPath/v1?key=${apiKey}&iconname=${payload.iconname}`,
        type: 'api',
      };
    },
    api_top_live_game() {
      return {
        url: `${apiUrl}/IDOTA2Match_570/GetTopLiveGame/v1/?key=${apiKey}&partner=0`,
        type: 'api',
      };
    },
    api_realtime_stats() {
      return {
        url: `${apiUrl}/IDOTA2MatchStats_570/GetRealtimeStats/v1?key=${apiKey}&server_steam_id=${payload.server_steam_id}`,
        type: 'api',
      };
    },
    api_team_info_by_team_id() {
      return {
        url: `${apiUrl}/IDOTA2Match_570/GetTeamInfoByTeamID/v1?key=${apiKey}&start_at_team_id=${payload.start_at_team_id}&teams_requested=1`,
        type: 'api',
      };
    },
    api_get_ugc_file_details() {
      return {
        url: `${apiUrl}/ISteamRemoteStorage/GetUGCFileDetails/v1/?key=${apiKey}&appid=570&ugcid=${payload.ugcid}`,
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
    steam_cdn_team_logos() {
      return {
        url: `https://steamcdn-a.akamaihd.net/apps/dota2/images/team_logos/${payload.team_id}.png`,
        type: 'steam_cdn',
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
 * */
function getData(url, cb) {
  let u;
  let delay = Number(config.DEFAULT_DELAY);
  let timeout = 5000;
  if (typeof url === 'object' && url && url.url) {
    // options object
    if (Array.isArray(url.url)) {
      // select a random element if array
      u = url.url[Math.floor(Math.random() * url.url.length)];
    } else {
      u = url.url;
    }
    delay = url.delay || delay;
    timeout = url.timeout || timeout;
  } else {
    u = url;
  }
  const parse = urllib.parse(u, true);
  const steamApi = parse.host === 'api.steampowered.com';
  const stratzApi = parse.host === 'api.stratz.com';
  if (steamApi) {
    // choose an api key to use
    const apiKeys = config.STEAM_API_KEY.split(',');
    parse.query.key = apiKeys[Math.floor(Math.random() * apiKeys.length)];
    parse.search = null;
    // choose a steam api host
    const apiHosts = config.STEAM_API_HOST.split(',');
    parse.host = apiHosts[Math.floor(Math.random() * apiHosts.length)];
  }
  const target = urllib.format(parse);
  console.log('%s - getData: %s', new Date(), target);
  return setTimeout(() => {
    request({
      url: target,
      json: !(url.raw),
      timeout,
    }, (err, res, body) => {
      if (err
        || !res
        || res.statusCode !== 200
        || !body
        || (steamApi
          && !url.raw
          && !body.result
          && !body.response
          && !body.player_infos
          && !body.teams
          && !body.game_list
          && !body.match
          && !body.data)
        || (stratzApi && (!body.results || !body.results[0]))
      ) {
        // invalid response
        if (url.noRetry) {
          return cb(err || 'invalid response');
        }
        console.error('[INVALID] status: %s, retrying: %s', res ? res.statusCode : '', target);
        // var backoff = res && res.statusCode === 429 ? delay * 2 : 0;
        const backoff = 0;
        return setTimeout(() => {
          getData(url, cb);
        }, backoff);
      } else if (body.result) {
        // steam api usually returns data with body.result, getplayersummaries has body.response
        if (body.result.status === 15
          || body.result.error === 'Practice matches are not available via GetMatchDetails'
          || body.result.error === 'No Match ID specified'
          || body.result.error === 'Match ID not found') {
          // private match history or attempting to get practice match/invalid id, don't retry
          // non-retryable
          return cb(body);
        } else if (body.result.error || body.result.status === 2) {
          // valid response, but invalid data, retry
          if (url.noRetry) {
            return cb(err || 'invalid data');
          }
          console.error('invalid data, retrying: %s, %s', target, JSON.stringify(body));
          return getData(url, cb);
        }
      }
      return cb(null, body, {
        hostname: parse.host,
      });
    });
  }, delay);
}
/**
 * Determines if a player is radiant
 * */
function isRadiant(player) {
  return player.player_slot < 128;
}

/**
 * Determines if a player won
 * */
function playerWon(player, match) {
  return (player.player_slot < 128) === match.radiant_win;
}

/**
 * Recursively merges objects that share some keys
 * Numbers get summed
 * Arrays get concatenated
 * Strings get concatenated
 * Objects get recursively merged
 * */
function mergeObjects(merge, val) {
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
function modeWithCount(array) {
  if (!array.length) {
    return {};
  }
  const modeMap = {};
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

function mode(array) {
  return modeWithCount(array).mode;
}

/**
 * Determines if a match is significant for aggregation purposes
 * */
function isSignificant(match) {
  return Boolean(constants.game_mode[match.game_mode]
  && constants.game_mode[match.game_mode].balanced
  && constants.lobby_type[match.lobby_type]
  && constants.lobby_type[match.lobby_type].balanced
  && match.radiant_win !== undefined
  && match.duration > 360
  && (match.players || []).every(player => (player.gold_per_min || 0) < 2500));
}

/**
 * Determines if a match is a pro match
 * */
function isProMatch(match, leagueids) {
  return Boolean(isSignificant(match)
  && match.leagueid
  && match.human_players === 10
  && (match.game_mode === 0 || match.game_mode === 1 || match.game_mode === 2)
  && match.players
  && match.players.every(player => player.level > 1)
  && match.players.every(player => player.xp_per_min > 0)
  && match.players.every(player => player.hero_id > 0)
  && leagueids.includes(match.leagueid));
}

/**
 * Finds the max of the input array
 * */
function max(array) {
  return Math.max.apply(null, array);
}

/**
 * Finds the min of the input array
 * */
function min(array) {
  return Math.min.apply(null, array);
}

/**
 * Serializes a JSON object to row for storage in Cassandra
 * */
function serialize(row) {
  const obj = {};
  Object.keys(row).forEach((key) => {
    if (row[key] !== null && !Number.isNaN(row[key]) && row[key] !== undefined) {
      obj[key] = JSON.stringify(row[key]);
    }
  });
  return obj;
}

/**
 * Deserializes a row to JSON object read from Cassandra
 * */
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
 * Returns the unix timestamp at the beginning of a block of n minutes
 * Offset controls the number of blocks to look ahead
 * */
function getStartOfBlockMinutes(size, offset) {
  offset = offset || 0;
  const blockS = size * 60;
  const curTime = Math.floor(new Date() / 1000);
  const blockStart = curTime - (curTime % blockS);
  return (blockStart + (offset * blockS)).toFixed(0);
}

function getEndOfMonth() {
  return moment().endOf('month').unix();
}

/**
 * Finds the arithmetic mean of the input array
 * */
function average(data) {
  return Math.floor((data.reduce(
    (a, b) =>
      a + b
    , 0,
  ) / data.length));
}

/**
 * Finds the standard deviation of the input array
 * */
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

/**
 * Finds the median of the input array
 * */
function median(data) {
  data.sort((a, b) =>
    a - b);
  const half = Math.floor(data.length / 2);
  if (data.length % 2) {
    return data[half];
  }
  return (data[half - 1] + data[half]) / 2.0;
}

/**
 * Gets the patch ID given a unix start time
 * */
function getPatchIndex(startTime) {
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
function buildReplayUrl(matchId, cluster, replaySalt) {
  const suffix = config.NODE_ENV === 'test' ? '.dem' : '.dem.bz2';
  return `http://replay${cluster}.valve.net/570/${matchId}_${replaySalt}${suffix}`;
}

/**
 * Computes the expected winrate given an input array of winrates
 * */
function expectedWin(rates) {
  // simple implementation, average
  // return rates.reduce((prev, curr) => prev + curr)) / hids.length;
  // advanced implementation, asymptotic
  // return 1 - rates.reduce((prev, curr) => (1 - curr) * prev, 1) / (Math.pow(50, rates.length-1));
  const adjustedRates = rates.reduce((prev, curr) => (100 - (curr * 100)) * prev, 1);
  const denominator = 50 ** (rates.length - 1);
  return 1 - ((adjustedRates / denominator) * 100);
}

/**
 * Converts a group of heroes to string
 * */
function groupToString(g) {
  return g.sort((a, b) =>
    a - b).join(',');
}

/**
 * Serialize a matchup/result of heroes to a string
 * */
function matchupToString(t0, t1, t0win) {
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
function kCombinations(arr, k) {
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
  for (i = 0; i < (arr.length - k) + 1; i += 1) {
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
function generateMatchups(match, max, oneSided) {
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
  for (let i = 1; i < (max + 1); i += 1) {
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
 * Counts the peer account_ids in the input match array
 * */
function countPeers(matches) {
  const teammates = {};
  matches.forEach((m) => {
    const playerWin = isRadiant(m) === m.radiant_win;
    const group = m.heroes || {};
    Object.keys(group).forEach((key) => {
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
      if (isRadiant(tm) === isRadiant(m)) {
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
function getAnonymousAccountId() {
  return 4294967295;
}

/**
 * Computes the lane a hero is in based on an input hash of positions
 * */
function getLaneFromPosData(lanePos, isRadiant) {
  // compute lanes
  const lanes = [];
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
  const isRoaming = (count / lanes.length) < 0.45;

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
    lane_role: laneRoles[lane],
    is_roaming: isRoaming,
  };
}

/**
 * Get array of retriever endpoints from config
 * */
function getRetrieverArr() {
  const input = config.RETRIEVER_HOST;
  const output = [];
  const arr = input.split(',');
  arr.forEach((element) => {
    const parsedUrl = urllib.parse(`http://${element}`, true);
    for (let i = 0; i < (parsedUrl.query.size || 1); i += 1) {
      output.push(parsedUrl.host);
    }
  });
  return output;
}

function redisCount(redis, prefix) {
  const key = `${prefix}:${moment().startOf('hour').format('X')}`;
  redis.pfadd(key, uuidV4());
  redis.expireat(key, moment().startOf('hour').add(1, 'day').format('X'));
}

function getRedisCountDay(redis, prefix, cb) {
  // Get counts for last 24 hour keys (including current partial hour)
  const keyArr = [];
  for (let i = 0; i < 24; i += 1) {
    keyArr.push(`${prefix}:${moment().startOf('hour').subtract(i, 'hour').format('X')}`);
  }
  redis.pfcount(...keyArr, cb);
}

function getRedisCountHour(redis, prefix, cb) {
  // Get counts for previous full hour
  const keyArr = [];
  for (let i = 1; i < 2; i += 1) {
    keyArr.push(`${prefix}:${moment().startOf('hour').subtract(i, 'hour').format('X')}`);
  }
  redis.pfcount(...keyArr, cb);
}

function invokeInterval(func, delay) {
  // invokes the function immediately, waits for callback, waits the delay, and then calls it again
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
  }());
}

/**
 * Returns the current UNIX Epoch time in weeks
 * */
function epochWeek() {
  return Math.floor(new Date() / (1000 * 60 * 60 * 24 * 7));
}

/* eslint-disable no-tabs */
function cleanItemSchema(input) {
  return input.replace(`"12187"
		{
			"name"		"Cavernite Dire Creeps"
			"prefab"		"direcreeps"
			"creation_date"		"2018-03-28"
			"event_id"		"EVENT_ID_INTERNATIONAL_2018"
			"image_inventory"		"econ/tools/ti8_dire_creeps"
			"item_description"		"#DOTA_Item_Desc_Cavernite_Dire_Creeps"
			"item_name"		"#DOTA_Item_Cavernite_Dire_Creeps"
			"item_rarity"		"legendary"
			"player_loadout"		"1"
			"static_attributes"
			{
				"cannot trade"
				{
					"attribute_class"		"cannot_trade"
					"value"		"1"
				}
				"not marketable"
				{
					"attribute_class"		"not marketable"
					"value"		"1"
				}
				"cannot delete"
				{
					"attribute_class"		"cannot_delete"
					"value"		"1"
				}
			}
			"visuals"
			{
				"asset_modifier"
				{
					"type"		"entity_clientside_model"
					"asset"		"npc_dota_creep_badguys_melee"
					"modifier"		"models/creeps/lane_creeps/creep_bad_melee/creep_bad_melee_cavern.vmdl"
				}
				"asset_modifier"
				{
					"type"		"portrait_game"
					"asset"		"npc_dota_creep_badguys_melee"
					"modifier"
					{
						"PortraitLightPosition"		"29.379999 12.250000 162.360001"
						"PortraitLightAngles"		"73.760002 10.190000 0.000000"
						"PortraitLightFOV"		"75"
						"PortraitLightDistance"		"115"
						"PortraitLightColor"		"191 240 254"
						"PortraitShadowColor"		"48 48 48"
						"PortraitShadowScale"		"5"
						"PortraitAmbientColor"		"155 104 104"
						"PortraitAmbientScale"		"5"
						"PortraitSpecularColor"		"251 74 84"
						"PortraitBackgroundTexture"		"materials/vgui/hud/heroportraits/portraitbackground_darkclouds.vmat"
						"PortraitBackgroundColor1"		"0.700000 0.340000 0.200000"
						"PortraitBackgroundColor2"		"0.700000 0.340000 0.200000"
						"PortraitBackgroundColor3"		"0.700000 0.340000 0.200000"
						"PortraitBackgroundColor4"		"0.700000 0.340000 0.200000"
						"PortraitLightScale"		"7.759000"
						"PortraitGroundShadowScale"		"1.500000"
						"PortraitAmbientDirection"		"-10.070 5.110 -31.920"
						"PortraitAnimationActivity"		"ACT_DOTA_IDLE"
						"cameras"
						{
							"default"
							{
								"PortraitPosition"		"322.152832 141.399353 16.114092"
								"PortraitAngles"		"350.009979 204.790024 0.000000"
								"PortraitFOV"		"17"
								"PortraitFar"		"1000"
							}
						}
						"PortraitSpecularDirection"		"0.000000 0.000000 -1.000000"
						"PortraitSpecularPower"		"16"
						"PortraitAnimationCycle"		"0"
						"PortraitAnimationRate"		"1"
						"PortraitHideHero"		"0"
						"PortraitHideParticles"		"0"
						"PortraitHideDropShadow"		"0"
						"PortraitDesaturateParticles"		"0"
						"PortraitDesaturateHero"		"1"
					}
				}
				"asset_modifier"
				{
					"type"		"entity_clientside_model"
					"asset"		"npc_dota_creep_badguys_ranged"
					"modifier"		"models/creeps/lane_creeps/creep_bad_ranged/creep_bad_ranged_cavern.vmdl"
				}
				"asset_modifier"
				{
					"type"		"portrait_game"
					"asset"		"npc_dota_creep_badguys_ranged"
					"modifier"
					{
						"PortraitLightPosition"		"57.590000 -15.800000 176.649994"
						"PortraitLightAngles"		"68.419998 172.600006 0.000000"
						"PortraitLightFOV"		"90"
						"PortraitLightDistance"		"99"
						"PortraitLightColor"		"254 248 242"
						"PortraitShadowColor"		"74 74 74"
						"PortraitShadowScale"		"5"
						"PortraitAmbientColor"		"79 108 108"
						"PortraitAmbientScale"		"5"
						"PortraitSpecularColor"		"251 74 84"
						"PortraitBackgroundTexture"		"materials/vgui/hud/heroportraits/portraitbackground_darkclouds.vmat"
						"PortraitBackgroundColor1"		"0.700000 0.340000 0.200000"
						"PortraitBackgroundColor2"		"0.700000 0.340000 0.200000"
						"PortraitBackgroundColor3"		"0.700000 0.340000 0.200000"
						"PortraitBackgroundColor4"		"0.700000 0.340000 0.200000"
						"PortraitLightScale"		"4.500000"
						"PortraitGroundShadowScale"		"1.500000"
						"PortraitAmbientDirection"		"-79.070 -84.150 -25.320"
						"PortraitAnimationActivity"		"ACT_DOTA_IDLE"
						"cameras"
						{
							"default"
							{
								"PortraitPosition"		"259.155487 112.627571 16.826363"
								"PortraitAngles"		"346.670013 203.990051 0.000000"
								"PortraitFOV"		"23"
								"PortraitFar"		"1000"
							}
						}
						"PortraitSpecularDirection"		"0.000000 0.000000 -1.000000"
						"PortraitSpecularPower"		"16"
						"PortraitAnimationCycle"		"0"
						"PortraitAnimationRate"		"1"
						"PortraitHideHero"		"0"
						"PortraitHideParticles"		"0"
						"PortraitHideDropShadow"		"0"
						"PortraitDesaturateParticles"		"0"
						"PortraitDesaturateHero"		"1"
					}
				}
			}
		}
		"12188"
		{
			"name"		"Cavernite Radiant Creeps"
			"prefab"		"radiantcreeps"
			"creation_date"		"2018-03-28"
			"event_id"		"EVENT_ID_INTERNATIONAL_2018"
			"image_inventory"		"econ/tools/ti8_radiant_creeps"
			"item_description"		"#DOTA_Item_Desc_Cavernite_Radiant_Creeps"
			"item_name"		"#DOTA_Item_Cavernite_Radiant_Creeps"
			"item_rarity"		"legendary"
			"item_type_name"		"#DOTA_WearableType_Misc"
			"player_loadout"		"1"
			"static_attributes"
			{
				"cannot trade"
				{
					"attribute_class"		"cannot_trade"
					"value"		"1"
				}
				"not marketable"
				{
					"attribute_class"		"not marketable"
					"value"		"1"
				}
				"cannot delete"
				{
					"attribute_class"		"cannot_delete"
					"value"		"1"
				}
			}
			"visuals"
			{
				"asset_modifier"
				{
					"type"		"entity_clientside_model"
					"asset"		"npc_dota_creep_goodguys_ranged"
					"modifier"		"models/creeps/lane_creeps/creep_radiant_ranged/radiant_ranged_mushroom.vmdl"
				}
				"asset_modifier"
				{
					"type"		"portrait_game"
					"asset"		"npc_dota_creep_goodguys_ranged"
					"modifier"
					{
						"PortraitLightPosition"		"32.842575 28.978897 228.010422"
						"PortraitLightAngles"		"61.560005 138.129349 0.000000"
						"PortraitLightFOV"		"90"
						"PortraitLightDistance"		"145.320007"
						"PortraitLightColor"		"254 248 242"
						"PortraitShadowColor"		"0 0 0"
						"PortraitShadowScale"		"1"
						"PortraitAmbientColor"		"37 46 47"
						"PortraitAmbientScale"		"1"
						"PortraitSpecularColor"		"251 74 84"
						"PortraitBackgroundTexture"		"materials/vgui/hud/heroportraits/portraitbackground_forest_two.vmat"
						"PortraitBackgroundColor1"		"0.239994 0.650004 0.669993"
						"PortraitBackgroundColor2"		"0.482353 0.576471 0.580392"
						"PortraitBackgroundColor3"		"0.670588 0.945098 1.000000"
						"PortraitBackgroundColor4"		"0.239994 0.650004 0.669993"
						"PortraitLightScale"		"2.638000"
						"PortraitGroundShadowScale"		"1.500000"
						"PortraitAmbientDirection"		"-79.070 -84.150 -25.320"
						"PortraitAnimationActivity"		"ACT_DOTA_CAPTURE"
						"cameras"
						{
							"default"
							{
								"PortraitPosition"		"245.656876 -70.023483 185.272385"
								"PortraitAngles"		"13.430002 164.880066 0.000000"
								"PortraitFOV"		"23"
								"PortraitFar"		"1000"
							}
						}
						"PortraitSpecularDirection"		"0.000000 0.000000 -1.000000"
						"PortraitSpecularPower"		"16"
						"PortraitAnimationCycle"		"0"
						"PortraitAnimationRate"		"1"
						"PortraitHideHero"		"0"
						"PortraitHideParticles"		"0"
						"PortraitHideDropShadow"		"0"
						"PortraitDesaturateParticles"		"0"
						"PortraitDesaturateHero"		"1"
					}
				}
				"asset_modifier"
				{
					"type"		"entity_clientside_model"
					"asset"		"npc_dota_creep_goodguys_melee"
					"modifier"		"models/creeps/lane_creeps/creep_radiant_melee/radiant_melee_mushroom.vmdl"
				}
				"asset_modifier"
				{
					"type"		"portrait_game"
					"asset"		"npc_dota_creep_goodguys_melee"
					"modifier"
					{
						"PortraitLightPosition"		"50.592018 35.204300 162.360001"
						"PortraitLightAngles"		"73.760002 -177.992172 0.000000"
						"PortraitLightFOV"		"75"
						"PortraitLightDistance"		"115"
						"PortraitLightColor"		"191 240 254"
						"PortraitShadowColor"		"0 0 0"
						"PortraitShadowScale"		"1"
						"PortraitAmbientColor"		"155 104 104"
						"PortraitAmbientScale"		"8.020000"
						"PortraitSpecularColor"		"251 74 84"
						"PortraitBackgroundTexture"		"materials/vgui/hud/heroportraits/portraitbackground_forest_two.vmat"
						"PortraitBackgroundColor1"		"0.200000 0.650980 0.701961"
						"PortraitBackgroundColor2"		"0.600000 0.807843 0.772549"
						"PortraitBackgroundColor3"		"0.200000 0.698039 0.701961"
						"PortraitBackgroundColor4"		"0.290196 0.592157 0.862745"
						"PortraitLightScale"		"2.503000"
						"PortraitGroundShadowScale"		"1.500000"
						"PortraitAmbientDirection"		"-10.070 5.110 -31.920"
						"PortraitAnimationActivity"		"ACT_DOTA_IDLE"
						"cameras"
						{
							"default"
							{
								"PortraitPosition"		"283.573395 -96.821640 147.939545"
								"PortraitAngles"		"11.609981 161.589996 0.000000"
								"PortraitFOV"		"17"
								"PortraitFar"		"1000"
							}
						}
						"PortraitSpecularDirection"		"0.000000 0.000000 -1.000000"
						"PortraitSpecularPower"		"16"
						"PortraitAnimationCycle"		"0"
						"PortraitAnimationRate"		"1"
						"PortraitHideHero"		"0"
						"PortraitHideParticles"		"0"
						"PortraitHideDropShadow"		"0"
						"PortraitDesaturateParticles"		"0"
						"PortraitDesaturateHero"		"1"
					}
				}
			}
		}`, '');
}
/* eslint-enable no-tabs */

module.exports = {
  tokenize,
  generateJob,
  getData,
  convert32to64,
  convert64to32,
  isRadiant,
  playerWon,
  mergeObjects,
  modeWithCount,
  mode,
  isSignificant,
  max,
  min,
  serialize,
  getStartOfBlockMinutes,
  getEndOfMonth,
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
  getLaneFromPosData,
  getRetrieverArr,
  isProMatch,
  redisCount,
  getRedisCountDay,
  getRedisCountHour,
  invokeInterval,
  epochWeek,
  cleanItemSchema,
};
