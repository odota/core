/**
 * Functions to build player object
 **/
var async = require('async');
var config = require('../config.js');
var constants = require('dotaconstants');
var queries = require("../store/queries");
var utility = require('../util/utility');
var aggregator = require('../util/aggregator');
var generatePositionData = utility.generatePositionData;
var player_fields = constants.player_fields;
var subkeys = player_fields.subkeys;
var countCats = player_fields.countCats;
var getPlayer = queries.getPlayer;
var getPlayerMatches = queries.getPlayerMatches;
var getPlayerRankings = queries.getPlayerRankings;
var getPlayerRatings = queries.getPlayerRatings;
var fillSkill = queries.fillSkill;
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
    pros: basicAggs.concat('teammates'),
    activity: basicAggs.concat('start_time'),
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
//TODO decommission this and aggregator with SPA
function buildPlayer(options, cb)
{
    var db = options.db;
    var redis = options.redis;
    var account_id = options.account_id;
    var orig_account_id = account_id;
    var info = options.info || "index";
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
    queryObj.project = cacheProj.concat(Object.keys(queryObj.js_agg).map(function(k)
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
        getPlayerMatches(orig_account_id, queryObj, processResults);

        function processResults(err, matches)
        {
            if (err)
            {
                return cb(err);
            }
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
                        var limit = Number(queryObj.keywords.limit) || (info === "index" ? 20 : undefined);
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
                            //exclude invalid hero_ids
                            if (Number(id))
                            {
                                heroes_list.push(
                                {
                                    hero_id: id,
                                    games: aggData.hero_id.counts[id],
                                    win: aggData.hero_id.win_counts[id]
                                });
                            }
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
                        queries.generateTeammateArrayFromHash(db, aggData.teammates, player, cb);
                    }
                    else if (info === "pros")
                    {
                        queries.generateProPlayersArrayFromHash(db, aggData.teammates, player, cb);
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

function preprocessQuery(query)
{
    //check if we already processed to ensure idempotence
    if (query.processed)
    {
        return;
    }
    //select,the query received, build the mongo query and the js filter based on this
    query.db_select = {};
    query.filter = {};
    query.keywords = {};
    query.filter_count = 0;
    var dbAble = {
        "account_id": 1,
    };
    //reserved keywords, don't treat these as filters
    var keywords = {
        "desc": 1,
        "project": 1,
        "limit": 1,
    };
    for (var key in query.select)
    {
        if (!keywords[key])
        {
            //arrayify the element
            query.select[key] = [].concat(query.select[key]).map(function(e)
            {
                if (typeof e === "object")
                {
                    //just return the object if it's an array or object
                    return e;
                }
                //numberify this element
                return Number(e);
            });
            if (dbAble[key])
            {
                query.db_select[key] = query.select[key][0];
            }
            query.filter[key] = query.select[key];
            query.filter_count += 1;
        }
        else
        {
            query.keywords[key] = query.select[key];
        }
    }
    //absolute limit for number of matches to extract
    query.limit = config.PLAYER_MATCH_LIMIT;
    //mark this query processed
    query.processed = true;
    //console.log(query);
    return query;
}
module.exports = buildPlayer;