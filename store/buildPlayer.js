/**
 * Functions to build player object
 **/
var async = require('async');
var constants = require('../constants.js');
var queries = require("../store/queries");
var utility = require('../util/utility');
var compute = require('../util/compute');
var computeMatchData = compute.computeMatchData;
var deserialize = utility.deserialize;
var aggregator = require('../util/aggregator');
var filter = require('../util/filter');
var config = require('../config');
var playerCache = require('../store/playerCache');
var util = require('util');
var moment = require('moment');
var generatePositionData = utility.generatePositionData;
var preprocessQuery = utility.preprocessQuery;
var readCache = playerCache.readCache;
var player_fields = constants.player_fields;
var subkeys = player_fields.subkeys;
var countCats = player_fields.countCats;
//Fields to project from Cassandra player caches
var cacheProj = ['account_id', 'match_id', 'player_slot', 'version', 'start_time', 'duration', 'game_mode', 'lobby_type', 'radiant_win', 'hero_id', 'game_mode', 'skill', 'duration', 'kills', 'deaths', 'assists', 'last_hits', 'gold_per_min'];
var cacheFilters = ['heroes', 'hero_id', 'lane_role', 'game_mode', 'lobby_type', 'region', 'patch', 'start_time'];
//Fields to aggregate on
//optimize by only aggregating certain columns based on tab
//set query.js_agg based on this
var basicAggs = ['match_id', 'win', 'lose'];
var aggs = {
    index: basicAggs.concat('hero_id'),
    matches: basicAggs,
    heroes: basicAggs.concat('heroes'),
    peers: basicAggs.concat('teammates'),
    activity: basicAggs.concat('start_time'),
    //TODO only need one subkey at a time
    records: basicAggs.concat(Object.keys(subkeys)),
    counts: basicAggs.concat(Object.keys(countCats)).concat(['multi_kills', 'kill_streaks', 'lane_role']),
    histograms: basicAggs.concat(Object.keys(subkeys)),
    trends: basicAggs.concat(Object.keys(subkeys)),
    wardmap: basicAggs.concat(['obs', 'sen']),
    items: basicAggs.concat(['purchase_time', 'item_usage', 'item_uses', 'purchase', 'item_win']),
    wordcloud: basicAggs.concat(['my_word_counts', 'all_word_counts']),
    rating: basicAggs,
    rankings: basicAggs,
};
var deps = {
    "teammates": "heroes",
    "win": "radiant_win",
    "lose": "radiant_win",
};

function buildPlayer(options, cb)
{
    var db = options.db;
    var redis = options.redis;
    var account_id = options.account_id;
    var orig_account_id = account_id;
    var info = options.info || "index";
    var subkey = options.subkey;
    var query = options.query;
    if (Number.isNaN(account_id))
    {
        return cb("non-numeric account_id");
    }
    if (Number(account_id) === constants.anonymous_account_id)
    {
        return cb("cannot generate profile for anonymous account_id");
    }
    var queryObj = {
        select: query
    };
    account_id = Number(account_id);
    //select player_matches with this account_id
    queryObj.select.account_id = account_id;
    queryObj = preprocessQuery(queryObj);
    //1 filter expected for account id
    var filter_exists = queryObj.filter_count > 1;
    //choose fields to aggregate based on tab
    var obj = {};
    aggs[info].forEach(function(k)
    {
        obj[k] = 1;
    });
    queryObj.js_agg = obj;
    //fields to project from the Cassandra cache
    queryObj.cacheProject = cacheProj.concat(Object.keys(queryObj.js_agg).map(function(k)
    {
        return deps[k] || k;
    })).concat(filter_exists ? cacheFilters : []).concat(query.desc ? query.desc : []);
    //Find player in db
    console.time("[PLAYER] getPlayer " + account_id);
    getPlayer(db, account_id, function(err, player)
    {
        console.timeEnd("[PLAYER] getPlayer " + account_id);
        if (err)
        {
            return cb(err);
        }
        player = player ||
        {
            account_id: account_id,
            personaname: account_id
        };
        if (config.ENABLE_PLAYER_CACHE)
        {
            console.time("[PLAYER] readCache " + account_id);
            readCache(orig_account_id, queryObj, function(err, cache)
            {
                console.timeEnd("[PLAYER] readCache " + account_id);
                if (err)
                {
                    return cb(err);
                }
                options.cache = true;
                processResults(err, cache);
            });
        }
        else
        {
            console.time("[PLAYER] getPlayerMatches " + account_id);
            getPlayerMatches(db, queryObj, options, function(err, results)
            {
                console.timeEnd("[PLAYER] getPlayerMatches " + account_id);
                if (err)
                {
                    return cb(err);
                }
                processResults(err, results);
            });
        }

        function processResults(err, cache)
        {
            if (err)
            {
                return cb(err);
            }
            var matches = cache.raw;
            var desc = queryObj.keywords.desc || "match_id";
            var limit = queryObj.keywords.limit ? Number(queryObj.keywords.limit) : undefined;
            //sort
            matches = matches.sort(function(a, b)
            {
                if (a[desc] === undefined || b[desc] === undefined)
                {
                    return a[desc] === undefined ? 1 : -1;
                }
                return Number(b[desc]) - Number(a[desc]);
            });
            //limit
            matches = matches.slice(0, limit);
            //aggregate
            var aggData = aggregator(matches, queryObj.js_agg);
            async.parallel(
            {
                profile: function(cb)
                {
                    return cb(null, player);
                },
                win: function(cb)
                {
                    return cb(null, aggData.win.sum);
                },
                lose: function(cb)
                {
                    return cb(null, aggData.lose.sum);
                },
                matches: function(cb)
                {
                    if (info === "index" || info === "matches")
                    {
                        var project = ["match_id", "player_slot", "hero_id", "game_mode", "kills", "deaths", "assists", "version", "skill", "radiant_win", "start_time", "duration"].concat(queryObj.keywords.desc || []);
                        var limit = Number(queryObj.keywords.limit) || 20;
                        //project
                        matches = matches.map(function(pm)
                        {
                            var obj = {};
                            project.forEach(function(key)
                            {
                                obj[key] = pm[key];
                            });
                            return obj;
                        });
                        //limit
                        matches = matches.slice(0, limit);
                        fillSkill(db, matches, options, cb);
                    }
                    else
                    {
                        cb(null, []);
                    }
                },
                heroes_list: function(cb)
                {
                    //convert heroes hash to array and sort
                    var heroes_list = [];
                    if (aggData.hero_id)
                    {
                        for (var id in aggData.hero_id.counts)
                        {
                            heroes_list.push(
                            {
                                hero_id: id,
                                games: aggData.hero_id.counts[id],
                                win: aggData.hero_id.win_counts[id]
                            });
                        }
                    }
                    else if (aggData.heroes)
                    {
                        var heroes = aggData.heroes;
                        for (var id in heroes)
                        {
                            var h = heroes[id];
                            heroes_list.push(h);
                        }
                    }
                    heroes_list.sort(function(a, b)
                    {
                        return b.games - a.games;
                    });
                    heroes_list = heroes_list.slice(0, info === "index" ? 20 : undefined);
                    return cb(null, heroes_list);
                },
                teammate_list: function(cb)
                {
                    if (info === "peers")
                    {
                        generateTeammateArrayFromHash(db, aggData.teammates, player, cb);
                    }
                    else
                    {
                        return cb();
                    }
                },
                mmr_estimate: function(cb)
                {
                    queries.mmrEstimate(db, redis, account_id, cb);
                },
                ratings: function(cb)
                {
                    if (info === "rating")
                    {
                        getPlayerRatings(db, account_id, cb);
                    }
                    else
                    {
                        cb();
                    }
                },
                solo_competitive_rank: function(cb)
                {
                    redis.zscore('solo_competitive_rank', account_id, cb);
                },
                competitive_rank: function(cb)
                {
                    redis.zscore('competitive_rank', account_id, cb);
                },
                rankings: function(cb)
                {
                    if (info === "rankings")
                    {
                        getPlayerRankings(redis, account_id, cb);
                    }
                    else
                    {
                        return cb();
                    }
                },
                activity: function(cb)
                {
                    if (info === "activity")
                    {
                        return cb(null, aggData.start_time);
                    }
                    else
                    {
                        return cb();
                    }
                },
                wardmap: function(cb)
                {
                    if (info === "wardmap")
                    {
                        //generally position data function is used to generate heatmap data for each player in a natch
                        //we use it here to generate a single heatmap for aggregated counts
                        var ward_data = {
                            obs: aggData.obs,
                            sen: aggData.sen,
                        };
                        var ward_counts = {
                            obs: ward_data.obs.counts,
                            sen: ward_data.sen.counts,
                        };
                        var d = {
                            "obs": true,
                            "sen": true
                        };
                        generatePositionData(d, ward_counts);
                        var obj = {
                            posData: [d]
                        };
                        return cb(null, Object.assign(
                        {}, obj, ward_data));
                    }
                    else
                    {
                        return cb();
                    }
                },
                wordcloud: function(cb)
                {
                    if (info === "wordcloud")
                    {
                        return cb(null,
                        {
                            my_word_counts: aggData.my_word_counts,
                            all_word_counts: aggData.all_word_counts
                        });
                    }
                    else
                    {
                        return cb();
                    }
                },
                aggData: function(cb)
                {
                    if (info === "histograms" || info === "counts" || info === "trends" || info === "items" || info === "skills" || info === "records")
                    {
                        return cb(null, aggData);
                    }
                    else
                    {
                        return cb();
                    }
                }
            }, cb);
        }
    });
}

function generateTeammateArrayFromHash(db, input, player, cb)
{
    if (!input)
    {
        return cb();
    }
    console.time('[PLAYER] generateTeammateArrayFromHash ' + player.account_id);
    var teammates_arr = [];
    var teammates = input;
    for (var id in teammates)
    {
        var tm = teammates[id];
        id = Number(id);
        //don't include if anonymous, self or if few games together
        if (id && id !== Number(player.account_id) && id !== constants.anonymous_account_id && (tm.games >= 5))
        {
            teammates_arr.push(tm);
        }
    }
    teammates_arr.sort(function(a, b)
    {
        return b.games - a.games;
    });
    //limit to 200 max players
    teammates_arr = teammates_arr.slice(0, 200);
    async.each(teammates_arr, function(t, cb)
    {
        db.first().from('players').where(
        {
            account_id: t.account_id
        }).asCallback(function(err, row)
        {
            if (err || !row)
            {
                return cb(err);
            }
            t.personaname = row.personaname;
            t.last_login = row.last_login;
            t.avatar = row.avatar;
            cb(err);
        });
    }, function(err)
    {
        console.timeEnd('[PLAYER] generateTeammateArrayFromHash ' + player.account_id);
        cb(err, teammates_arr);
    });
}

function fillSkill(db, matches, options, cb)
{
    //fill in skill data from table (only necessary if reading from cache since adding skill data doesn't update cache)
    console.time('[PLAYER] fillSkill');
    //get skill data for matches within cache expiry (might not have skill data)
    /*
    var recents = matches.filter(function(m)
    {
        return moment().diff(moment.unix(m.start_time), 'days') <= config.UNTRACK_DAYS;
    });
    */
    //just get skill for last N matches (faster)
    var recents = matches.slice(0, 30);
    var skillMap = {};
    db.select(['match_id', 'skill']).from('match_skill').whereIn('match_id', recents.map(function(m)
    {
        return m.match_id;
    })).asCallback(function(err, rows)
    {
        if (err)
        {
            return cb(err);
        }
        console.log("fillSkill recents: %s, results: %s", recents.length, rows.length);
        rows.forEach(function(match)
        {
            skillMap[match.match_id] = match.skill;
        });
        matches.forEach(function(m)
        {
            m.skill = m.skill || skillMap[m.match_id];
        });
        console.timeEnd('[PLAYER] fillSkill');
        return cb(err, matches);
    });
}

function getPlayerMatches(db, queryObj, options, cb)
{
    var stream;
    stream = db.select(queryObj.project).from('player_matches').where(queryObj.db_select).limit(queryObj.limit).innerJoin('matches', 'player_matches.match_id', 'matches.match_id').leftJoin('match_skill', 'player_matches.match_id', 'match_skill.match_id').stream();
    var matches = [];
    stream.on('end', function(err)
    {
        cb(err,
        {
            raw: matches
        });
    });
    stream.on('data', function(m)
    {
        computeMatchData(m);
        if (filter([m], queryObj.js_select).length)
        {
            matches.push(m);
        }
    });
    stream.on('error', function(err)
    {
        throw err;
    });
}

function getPlayerRatings(db, account_id, cb)
{
    console.time('[PLAYER] getPlayerRatings ' + account_id);
    if (!Number.isNaN(account_id))
    {
        db.from('player_ratings').where(
        {
            account_id: Number(account_id)
        }).orderBy('time', 'asc').asCallback(function(err, result)
        {
            console.timeEnd('[PLAYER] getPlayerRatings ' + account_id);
            cb(err, result);
        });
    }
    else
    {
        cb();
    }
}

function getPlayerRankings(redis, account_id, cb)
{
    console.time('[PLAYER] getPlayerRankings ' + account_id);
    async.map(Object.keys(constants.heroes), function(hero_id, cb)
    {
        redis.zcard(['hero_rankings', moment().startOf('quarter').format('X'), hero_id].join(':'), function(err, card)
        {
            if (err)
            {
                return cb(err);
            }
            redis.zrank(['hero_rankings', moment().startOf('quarter').format('X'), hero_id].join(':'), account_id, function(err, rank)
            {
                cb(err,
                {
                    hero_id: hero_id,
                    rank: rank,
                    card: card
                });
            });
        });
    }, function(err, result)
    {
        console.timeEnd('[PLAYER] getPlayerRankings ' + account_id);
        cb(err, result);
    });
}

function getPlayer(db, account_id, cb)
{
    if (!Number.isNaN(account_id))
    {
        db.first().from('players').where(
        {
            account_id: Number(account_id)
        }).asCallback(cb);
    }
    else
    {
        cb();
    }
}
module.exports = buildPlayer;