/**
 * Provides utility functions.
 * All functions should have external dependencies (DB, etc.) self-contained.
 * A bare Node installation should be able to require() this file without errors.
 **/
var config = require('../config');
var constants = require('dotaconstants');
var request = require('request');
var BigNumber = require('big-number');
var urllib = require('url');
/**
 * Tokenizes an input string.
 *
 * @param {String} Input
 *
 * @return {Array}
 */
function tokenize(input)
{
    return input.replace(/[^a-zA-Z- ]+/g, '').replace('/ {2,}/', ' ').toLowerCase().split(' ');
}
/**
 * Creates a job object for enqueueing that contains details such as the Steam API endpoint to hit
 **/
function generateJob(type, payload)
{
    var api_url = "http://api.steampowered.com";
    var api_key;
    var opts = {
        "api_details": function ()
        {
            return {
                url: api_url + "/IDOTA2Match_570/GetMatchDetails/V001/?key=" + api_key + "&match_id=" + payload.match_id,
                title: [type, payload.match_id].join(),
                type: "api",
                payload: payload
            };
        },
        "api_history": function ()
        {
            return {
                url: api_url + "/IDOTA2Match_570/GetMatchHistory/V001/?key=" + api_key + (payload.account_id ? "&account_id=" + payload.account_id : "") + (payload.matches_requested ? "&matches_requested=" + payload.matches_requested : "") + (payload.hero_id ? "&hero_id=" + payload.hero_id : "") + (payload.leagueid ? "&league_id=" + payload.leagueid : "") + (payload.start_at_match_id ? "&start_at_match_id=" + payload.start_at_match_id : ""),
                title: [type, payload.account_id].join(),
                type: "api",
                payload: payload
            };
        },
        "api_summaries": function ()
        {
            return {
                url: api_url + "/ISteamUser/GetPlayerSummaries/v0002/?key=" + api_key + "&steamids=" + payload.players.map(function (p)
                {
                    return convert32to64(p.account_id).toString();
                }).join(),
                title: [type, payload.summaries_id].join(),
                type: "api",
                payload: payload
            };
        },
        "api_sequence": function ()
        {
            return {
                url: api_url + "/IDOTA2Match_570/GetMatchHistoryBySequenceNum/V001/?key=" + api_key + "&start_at_match_seq_num=" + payload.start_at_match_seq_num,
                title: [type, payload.seq_num].join(),
                type: "api"
            };
        },
        "api_heroes": function ()
        {
            return {
                url: api_url + "/IEconDOTA2_570/GetHeroes/v0001/?key=" + api_key + "&language=" + payload.language,
                title: [type, payload.language].join(),
                type: "api",
                payload: payload
            };
        },
        "api_leagues": function ()
        {
            return {
                url: api_url + "/IDOTA2Match_570/GetLeagueListing/v0001/?key=" + api_key,
                title: [type].join(),
                type: "api",
                payload: payload
            };
        },
        "api_skill": function ()
        {
            return {
                url: api_url + "/IDOTA2Match_570/GetMatchHistory/v0001/?key=" + api_key + "&start_at_match_id=" + payload.start_at_match_id + "&skill=" + payload.skill + "&hero_id=" + payload.hero_id + "&min_players=10",
                title: [type, payload.skill].join(),
                type: "api",
                payload: payload
            };
        },
        "api_live": function ()
        {
            return {
                url: api_url + "/IDOTA2Match_570/GetLiveLeagueGames/v0001/?key=" + api_key,
                title: [type].join(),
                type: "api",
                payload: payload
            };
        },
        "api_notable": function ()
        {
            return {
                url: api_url + "/IDOTA2Fantasy_570/GetProPlayerList/v1/?key=" + api_key,
                title: [type].join(),
                type: "api",
                payload: payload
            };
        },
        "api_teams": function ()
        {
            return {
                url: api_url + "/IDOTA2Teams_570/GetTeamInfo/v1/?key=" + api_key + "&team_id=" + payload.team_id,
                title: [type].join(),
                type: "api",
                payload: payload,
            };
        },
        "parse": function ()
        {
            return {
                title: [type, payload.match_id].join(),
                type: type,
                url: payload.url,
                payload: payload
            };
        },
        "request": function ()
        {
            return {
                url: api_url + "/IDOTA2Match_570/GetMatchDetails/V001/?key=" + api_key + "&match_id=" + payload.match_id,
                title: [type, payload.match_id].join(),
                type: type,
                request: true,
                payload: payload
            };
        },
        "fullhistory": function ()
        {
            return {
                title: [type, payload.account_id].join(),
                type: type,
                payload: payload
            };
        },
        "mmr": function ()
        {
            return {
                title: [type, payload.match_id, payload.account_id].join(),
                type: type,
                payload: payload
            };
        },
        "cache": function ()
        {
            return {
                title: [type, payload.match_id, payload.account_id].join(),
                type: type,
                payload: payload
            };
        },
        "rank": function ()
        {
            return {
                title: [type, payload.account_id, payload.hero_id].join(),
                type: type,
                payload: payload
            };
        }
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
function getData(url, cb)
{
    var u;
    var delay = Number(config.DEFAULT_DELAY);
    var proxyAffinityRange;
    if (url.constructor === Array)
    {
        //select a random element if array
        u = url[Math.floor(Math.random() * url.length)];
    }
    else if (typeof url === "object")
    {
        //options object
        u = url.url;
        delay = url.delay || delay;
        proxyAffinityRange = url.proxyAffinityRange || proxyAffinityRange;
    }
    else
    {
        u = url;
    }
    var parse = urllib.parse(u, true);
    var proxy;
    var steam_api = false;
    if (parse.host === "api.steampowered.com")
    {
        steam_api = true;
        //choose an api key to use
        var api_keys = config.STEAM_API_KEY.split(",");
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
        //choose a steam api host
        var api_hosts = config.STEAM_API_HOST.split(",");
        api_hosts = proxyAffinityRange ? api_hosts.slice(0, proxyAffinityRange) : api_hosts;
        parse.host = api_hosts[Math.floor(Math.random() * api_hosts.length)];
    }
    var target = urllib.format(parse);
    console.error("%s - getData: %s", new Date(), target);
    return setTimeout(function ()
    {
        request(
        {
            proxy: proxy,
            url: target,
            json: true,
            timeout: 30000
        }, function (err, res, body)
        {
            if (body && body.error)
            {
                //body contained specific error (probably from retriever)
                //non-retryable
                return cb(body);
            }
            if (err || !res || res.statusCode !== 200 || !body || (steam_api && !body.result && !body.response && !body.player_infos && !body.teams))
            {
                //invalid response
                if (url.noRetry)
                {
                    return cb(err || "invalid response");
                }
                else
                {
                    console.error("[INVALID] status: %s, retrying: %s", res ? res.statusCode : '', target);
                    var backoff = res && res.statusCode === 429 ? delay * 2 : 0;
                    return setTimeout(function()
                    {
                        getData(url, cb);
                    }, backoff);
                }
            }
            else if (body.result)
            {
                //steam api usually returns data with body.result, getplayersummaries has body.response
                if (body.result.status === 15 || body.result.error === "Practice matches are not available via GetMatchDetails" || body.result.error === "No Match ID specified" || body.result.error === "Match ID not found")
                {
                    //user does not have stats enabled or attempting to get private match/invalid id, don't retry
                    //non-retryable
                    return cb(body);
                }
                else if (body.result.error || body.result.status === 2)
                {
                    //valid response, but invalid data, retry
                    if (url.noRetry)
                    {
                        return cb(err || "invalid data");
                    }
                    else
                    {
                        console.error("invalid data, retrying: %s, %s", target, JSON.stringify(body));
                        return getData(url, cb);
                    }
                }
            }
            return cb(null, body,
            {
                hostname: parse.host
            });
        });
    }, delay);
}
/*
 * Converts a steamid 64 to a steamid 32
 *
 * Returns a BigNumber
 */
function convert64to32(id)
{
    return new BigNumber(id).minus('76561197960265728');
}
/*
 * Converts a steamid 64 to a steamid 32
 *
 * Returns a BigNumber
 */
function convert32to64(id)
{
    return new BigNumber('76561197960265728').plus(id);
}

function isRadiant(player)
{
    return player.player_slot < 128;
}

function mergeObjects(merge, val)
{
    for (var attr in val)
    {
        //NaN test
        if (Number.isNaN(val[attr]))
        {
            val[attr] = 0;
        }
        //does property exist?
        if (!merge[attr])
        {
            merge[attr] = val[attr];
        }
        else if (val[attr] && val[attr].constructor === Array)
        {
            merge[attr] = merge[attr].concat(val[attr]);
        }
        else if (typeof val[attr] === "object")
        {
            mergeObjects(merge[attr], val[attr]);
        }
        else
        {
            merge[attr] += Number(val[attr]);
        }
    }
}

function mode(array)
{
    if (array.length == 0) return null;
    var modeMap = {};
    var maxEl = array[0],
        maxCount = 1;
    for (var i = 0; i < array.length; i++)
    {
        var el = array[i];
        if (modeMap[el] == null) modeMap[el] = 1;
        else modeMap[el]++;
        if (modeMap[el] > maxCount)
        {
            maxEl = el;
            maxCount = modeMap[el];
        }
    }
    return maxEl;
}

function getParseSchema()
{
    return {
        "version": 16,
        "match_id": 0,
        "teamfights": [],
        "objectives": [],
        "chat": [],
        "radiant_gold_adv": [],
        "radiant_xp_adv": [],
        "players": Array.apply(null, new Array(10)).map(function ()
        {
            return {
                "player_slot": 0,
                "obs_placed": 0,
                "sen_placed": 0,
                "creeps_stacked": 0,
                "camps_stacked": 0,
                "rune_pickups": 0,
                "stuns": 0,
                "max_hero_hit":
                {
                    value: 0
                },
                "times": [],
                "gold_t": [],
                "lh_t": [],
                "dn_t": [],
                "xp_t": [],
                "obs_log": [],
                "sen_log": [],
                "obs_left_log": [],
                "sen_left_log": [],
                "purchase_log": [],
                "kills_log": [],
                "buyback_log": [],
                //"pos": {},
                "lane_pos":
                {},
                "obs":
                {},
                "sen":
                {},
                "actions":
                {},
                "pings":
                {},
                "purchase":
                {},
                "gold_reasons":
                {},
                "xp_reasons":
                {},
                "killed":
                {},
                "item_uses":
                {},
                "ability_uses":
                {},
                "hero_hits":
                {},
                "damage":
                {},
                "damage_taken":
                {},
                "damage_inflictor":
                {},
                "runes":
                {},
                "killed_by":
                {},
                "kill_streaks":
                {},
                "multi_kills":
                {},
                "life_state":
                {},
                "healing":
                {},
                "damage_inflictor_received":
                {},
                /*
                "kill_streaks_log": [], // an array of kill streak values
                //     where each kill streak is an array of kills where
                //         where each kill is an object that contains
                //             - the hero id of the player who was killed
                //             - the multi kill id of this kill
                //             - the team fight id of this kill
                //             - the time of this kill
                "multi_kill_id_vals": [] // an array of multi kill values (the length of each multi kill)
                */
            };
        })
    };
}

function generatePositionData(d, p)
{
    //d, a hash of keys to process
    //p, a player containing keys with values as position hashes
    //stores the resulting arrays in the keys of d
    //64 is the offset of x and y values
    //subtracting y from 127 inverts from bottom/left origin to top/left origin
    for (var key in d)
    {
        var t = [];
        for (var x in p[key])
        {
            for (var y in p[key][x])
            {
                t.push(
                {
                    x: Number(x) - 64,
                    y: 127 - (Number(y) - 64),
                    value: p[key][x][y]
                });
            }
        }
        d[key] = t;
    }
    return d;
}

function isSignificant(m)
{
    return Boolean(constants.game_mode[m.game_mode] && constants.game_mode[m.game_mode].balanced && constants.lobby_type[m.lobby_type] && constants.lobby_type[m.lobby_type].balanced && m.radiant_win !== undefined && m.duration > 60 * 5);
}

function max(array)
{
    return Math.max.apply(null, array);
}

function min(array)
{
    return Math.min.apply(null, array);
}

function getAggs()
{
    return {
        account_id: "api",
        match_id: "api",
        player_slot: "api",
        heroes: "api",
        radiant_win: "api",
        start_time: "api",
        duration: "api",
        cluster: "api",
        region: "api",
        patch: "api",
        lobby_type: "api",
        game_mode: "api",
        level: "api",
        kills: "api",
        deaths: "api",
        assists: "api",
        kda: "api",
        last_hits: "api",
        denies: "api",
        hero_damage: "api",
        tower_damage: "api",
        hero_healing: "api",
        gold_per_min: "api",
        xp_per_min: "api",
        hero_id: "api",
        leaver_status: "api",
        version: "parsed",
        courier_kills: "parsed",
        tower_kills: "parsed",
        neutral_kills: "parsed",
        lane: "parsed",
        lane_role: "parsed",
        obs: "parsed",
        sen: "parsed",
        item_uses: "parsed",
        purchase_time: "parsed",
        item_usage: "parsed",
        item_win: "parsed",
        purchase: "parsed",
        multi_kills: "parsed",
        kill_streaks: "parsed",
        all_word_counts: "parsed",
        my_word_counts: "parsed",
        "throw": "parsed",
        comeback: "parsed",
        stomp: "parsed",
        loss: "parsed",
        actions_per_min: "parsed",
        purchase_ward_observer: "parsed",
        purchase_ward_sentry: "parsed",
        purchase_tpscroll: "parsed",
        purchase_rapier: "parsed",
        purchase_gem: "parsed",
        pings: "parsed",
        stuns: "parsed",
        lane_efficiency_pct: "parsed",
        skill: "skill"
    };
}
//reduce match to only fields needed for aggregation/filtering
function reduceAggregable(pm)
{
    var result = {};
    for (var key in getAggs())
    {
        result[key] = pm[key];
    }
    return result;
}
/**
 * Serializes a JSON object to row for storage in Cassandra
 **/
function serialize(row)
{
    var obj = {};
    for (var key in row)
    {
        if (row[key] !== null && !Number.isNaN(row[key]) && row[key] !== undefined)
        {
            obj[key] = JSON.stringify(row[key]);
        }
    }
    return obj;
}
/**
 * Deserializes a row to JSON object read from Cassandra
 **/
function deserialize(row)
{
    var obj = {};
    row.keys().forEach(function (key)
    {
        try
        {
            obj[key] = JSON.parse(row[key]);
        }
        catch (e)
        {
            console.error('exception occurred during JSON parse: %s', e);
        }
    });
    return obj;
}
/**
 * Returns a list of heroes sorted in alphabetical order
 **/
function getAlphaHeroes()
{
    var alpha_heroes = Object.keys(constants.heroes).map(function (id)
    {
        return constants.heroes[id];
    }).sort(function (a, b)
    {
        return a.localized_name < b.localized_name ? -1 : 1;
    });
    return alpha_heroes;
}
/**
 * Formats a snake_cased string for display
 **/
function prettyPrint(str)
{
    return str.split("_").map(function (s)
    {
        switch (s)
        {
        case "xp":
            return "XP";
        case "kda":
            return "KDA";
        case "tpscroll":
            return "TP Scroll";
        default:
            return s.charAt(0).toUpperCase() + s.slice(1);
        }
    }).join(" ");
}
/**
 * Returns a string of the unix timestamp at the beginning of a block of size hours
 * Offset controls the number of blocks to look ahead
 **/
function getStartOfBlockHours(size, offset)
{
    offset = offset || 0;
    const blockS = size * 60 * 60;
    return (Math.floor(((new Date() / 1000 + (offset * blockS)) / blockS)) * blockS).toFixed(0);
}

function percentToTextClass(pct)
{
    if (pct >= 0.8)
    {
        return {
            className: "text-success",
            grade: "A"
        };
    }
    else if (pct >= 0.6)
    {
        return {
            className: "text-info",
            grade: "B"
        };
    }
    else if (pct >= 0.4)
    {
        return {
            className: "text-primary",
            grade: "C"
        };
    }
    else if (pct >= 0.2)
    {
        return {
            className: "text-warning",
            grade: "D"
        };
    }
    else
    {
        return {
            className: "text-danger",
            grade: "F"
        };
    }
}

function average(data)
{
    return ~~(data.reduce(function (a, b)
    {
        return a + b;
    }, 0) / data.length);
}

function stdDev(data)
{
    var avg = average(data);
    var squareDiffs = data.map(function (value)
    {
        var diff = value - avg;
        var sqrDiff = diff * diff;
        return sqrDiff;
    });
    var avgSquareDiff = average(squareDiffs);
    var stdDev = Math.sqrt(avgSquareDiff);
    return stdDev;
}

function median(data)
{
    data.sort(function (a, b)
    {
        return a - b;
    });
    var half = Math.floor(data.length / 2);
    if (data.length % 2) return data[half];
    else return (data[half - 1] + data[half]) / 2.0;
}

function getPatchIndex(start_time)
{
    var date = new Date(start_time * 1000);
    for (var i = 1; i < constants.patch.length; i++)
    {
        var pd = new Date(constants.patch[i].date);
        //stop when patch date is past the start time
        if (pd > date)
        {
            break;
        }
    }
    //use the value of i before the break, started at 1 to avoid negative index
    return i - 1;
}

function buildReplayUrl(match_id, cluster, replay_salt)
{
    const suffix = config.NODE_ENV === 'test' ? '.dem' : '.dem.bz2';
    return "http://replay" + cluster + ".valve.net/570/" + match_id + "_" + replay_salt + suffix;
}

function expectedWin(rates)
{
    //simple implementation, average
    //return rates.reduce((prev, curr) => prev + curr)) / hids.length;
    //advanced implementation, asymptotic
    //return 1 - rates.reduce((prev, curr) => (1 - curr) * prev, 1) / (Math.pow(50, rates.length-1));
    return 1 - rates.reduce((prev, curr) => (100 - curr * 100) * prev, 1) / (Math.pow(50, rates.length - 1) * 100);
}

function matchupToString(t0, t1, t0win)
{
    //create sorted strings of each team
    var rcg = groupToString(t0);
    var dcg = groupToString(t1);
    var suffix = '0';
    if (rcg <= dcg)
    {
        suffix = t0win ? '0' : '1';
        return rcg + ':' + dcg + ':' + suffix;
    }
    else
    {
        suffix = t0win ? '1' : '0';
        return dcg + ':' + rcg + ':' + suffix;
    }
}

function groupToString(g)
{
    return g.sort(function (a, b)
    {
        return a - b;
    }).join(',');
}

function kCombinations(arr, k)
{
    var i, j, combs, head, tailcombs;
    if (k > arr.length || k <= 0)
    {
        return [];
    }
    if (k === arr.length)
    {
        return [arr];
    }
    if (k == 1)
    {
        combs = [];
        for (i = 0; i < arr.length; i++)
        {
            combs.push([arr[i]]);
        }
        return combs;
    }
    // Assert {1 < k < arr.length}
    combs = [];
    for (i = 0; i < arr.length - k + 1; i++)
    {
        head = arr.slice(i, i + 1);
        //recursively get all combinations of the remaining array
        tailcombs = kCombinations(arr.slice(i + 1), k - 1);
        for (j = 0; j < tailcombs.length; j++)
        {
            combs.push(head.concat(tailcombs[j]));
        }
    }
    return combs;
}

function generateMatchups(match, max)
{
    max = max || 5;
    var radiant = [];
    var dire = [];
    //start with empty arrays for the choose 0 case
    var rCombs = [
        []
    ];
    var dCombs = [
        []
    ];
    const result = [];
    for (var i = 0; i < match.players.length; i++)
    {
        var p = match.players[i];
        if (p.hero_id === 0)
        {
            //exclude this match if any hero is 0
            return;
        }
        if (isRadiant(p))
        {
            radiant.push(p.hero_id);
        }
        else
        {
            dire.push(p.hero_id);
        }
    }
    for (var i = 1; i < (max + 1); i++)
    {
        var rc = kCombinations(radiant, i);
        var dc = kCombinations(dire, i);
        rCombs = rCombs.concat(rc);
        dCombs = dCombs.concat(dc);
    }
    //iterate over combinations, increment count for unique key
    //include empty set for opposing team (current picks data)
    //t0, t1 are ordered lexicographically
    //format: t0:t1:winner
    //::0
    //::1
    //1::0
    //1::1
    //1:2:0
    //when searching, take as input t0, t1 and retrieve data for both values of t0win
    rCombs.forEach(function (t0)
    {
        dCombs.forEach(function (t1)
        {
            var key = matchupToString(t0, t1, match.radiant_win);
            result.push(key);
        });
    });
    return result;
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
    generatePositionData,
    getParseSchema,
    isSignificant,
    max,
    min,
    getAggs,
    reduceAggregable,
    serialize,
    getAlphaHeroes,
    prettyPrint,
    getStartOfBlockHours,
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
};
