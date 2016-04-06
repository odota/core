module.exports = buildPlayer;
var async = require('async');
var constants = require('./constants.js');
var queries = require("./queries");
var utility = require('./utility');
var config = require('./config');
var playerCache = require('./playerCache');
var getPlayerMatches = queries.getPlayerMatches;
var getPlayer = queries.getPlayer;
var getPlayerRankings = queries.getPlayerRankings;
var generatePositionData = utility.generatePositionData;
var preprocessQuery = utility.preprocessQuery;
var readCache = playerCache.readCache;
var writeCache = playerCache.writeCache;
var validateCache = playerCache.validateCache;
var player_fields = constants.player_fields;
var subkeys = player_fields.subkeys;
var countCats = player_fields.countCats;
//optimize by only projecting certain columns based on tab
//set query.project based on this
var basic = ['player_matches.match_id', 'hero_id', 'start_time', 'duration', 'kills', 'deaths', 'assists', 'player_slot', 'account_id', 'game_mode', 'lobby_type', 'match_skill.skill', 'parse_status', 'radiant_win', 'leaver_status', 'version', 'cluster'];
var advanced = ['last_hits', 'denies', 'gold_per_min', 'xp_per_min', 'gold_t', 'first_blood_time', 'level', 'hero_damage', 'tower_damage', 'hero_healing', 'stuns', 'killed', 'pings', 'radiant_gold_adv', 'actions'];
var others = ['pgroup', 'kill_streaks', 'multi_kills', 'obs', 'sen', 'purchase_log', 'item_uses', 'hero_hits', 'ability_uses', 'chat'];
var filter = ['purchase', 'lane_pos'];
var everything = basic.concat(advanced).concat(others).concat(filter);
var projections = {
    index: basic.concat('pgroup'),
    matches: basic,
    heroes: basic.concat('pgroup'),
    peers: basic.concat('pgroup'),
    activity: basic,
    histograms: basic.concat(advanced).concat(['purchase']),
    records: basic.concat(advanced).concat(['purchase', 'kill_streaks', 'multi_kills']),
    trends: basic.concat(advanced).concat(['purchase']),
    wardmap: basic.concat(['obs', 'sen']),
    items: basic.concat(['purchase', 'purchase_log', 'item_uses']),
    skills: basic.concat(['hero_hits', 'ability_uses']),
    wordcloud: basic.concat('chat'),
    rating: basic,
    rankings: basic,
    hyperopia: basic
};
//optimize by only aggregating certain columns based on tab
//set query.js_agg based on this
var basicAggs = ['match_id', 'version', 'abandons', 'win', 'lose'];
var aggs = {
    index: basicAggs.concat('heroes'),
    matches: basicAggs,
    heroes: basicAggs.concat('heroes'),
    peers: basicAggs.concat('teammates'),
    activity: basicAggs.concat('start_time'),
    histograms: basicAggs.concat(Object.keys(subkeys)),
    records: basicAggs.concat(Object.keys(subkeys)).concat(Object.keys(countCats)).concat(['multi_kills', 'kill_streaks']),
    trends: basicAggs.concat(Object.keys(subkeys)),
    wardmap: basicAggs.concat(['obs', 'sen']),
    items: basicAggs.concat(['purchase_time', 'item_usage', 'item_uses', 'purchase', 'item_win']),
    skills: basicAggs.concat(['hero_hits', 'ability_uses']),
    wordcloud: basicAggs.concat(['my_word_counts', 'all_word_counts']),
    rating: basicAggs,
    rankings: basicAggs,
    hyperopia: basicAggs
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
    //project fields to aggregate based on tab
    var obj = {};
    aggs[info].forEach(function(k)
    {
        obj[k] = 1;
    });
    queryObj.js_agg = obj;
    queryObj = preprocessQuery(queryObj);
    //1 filter expected for account id
    var filter_exists = queryObj.filter_count > 1;
    //try to find player in db
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
        if (filter_exists && !config.CASSANDRA_PLAYER_CACHE)
        {
            console.log("filter exists");
            return cacheMiss();
        }
        console.time("[PLAYER] readCache " + account_id);
        readCache(orig_account_id, queryObj, function(err, cache)
        {
            console.timeEnd("[PLAYER] readCache " + account_id);
            if (err)
            {
                return cb(err);
            }
            //check count of matches in db to validate cache
            console.time("[PLAYER] validateCache " + account_id);
            validateCache(db, redis, account_id, cache, function(err, valid)
            {
                console.timeEnd("[PLAYER] validateCache " + account_id);
                if (err)
                {
                    return cb(err);
                }
                if (!valid)
                {
                    return cacheMiss();
                }
                else
                {
                    console.log("player cache hit %s", player.account_id);
                    options.cache = true;
                    processResults(err, cache);
                }
            });
        });

        function cacheMiss()
        {
            console.log("player cache miss %s", player.account_id);
            //we need to project everything to build a new cache, otherwise optimize and do a subset
            queryObj.project = config.ENABLE_PLAYER_CACHE ? everything : projections[info];
            //need fields to filter on if a filter is specified
            queryObj.project = queryObj.project.concat(filter_exists ? filter : []);
            console.time("[PLAYER] getPlayerMatches " + account_id);
            getPlayerMatches(db, queryObj, function(err, results)
            {
                console.timeEnd("[PLAYER] getPlayerMatches " + account_id);
                if (err)
                {
                    return cb(err);
                }
                //save the cache if complete data
                if (!filter_exists && player.account_id !== constants.anonymous_account_id)
                {
                    console.time("[PLAYER] writeCache " + account_id);
                    writeCache(player.account_id, results, function(err)
                    {
                        if (err)
                        {
                            console.error(err);
                        }
                        console.timeEnd("[PLAYER] writeCache " + account_id);
                    });
                }
                //don't need to wait for cache write
                processResults(err, results);
            });
        }

        function processResults(err, cache)
        {
            if (err)
            {
                return cb(err);
            }
            var aggData = cache.aggData;
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
                        //unpack hash of matches into array
                        var matches = aggData.matches;
                        var arr = [];
                        for (var key in matches)
                        {
                            arr.push(matches[key]);
                        }
                        matches = arr;
                        //sort matches by descending match id for display
                        matches.sort(function(a, b)
                        {
                            return Number(b.match_id) - Number(a.match_id);
                        });
                        matches = matches.slice(0, info === "index" ? 30 : undefined);
                        if (options.cache)
                        {
                            fillSkill(db, matches, options, cb);
                        }
                        else
                        {
                            cb(null, matches);
                        }
                    }
                    else
                    {
                        cb(null, []);
                    }
                },
                heroes_list: function(cb)
                {
                    //convert heroes hash to array and sort
                    if (aggData.heroes)
                    {
                        var heroes_list = [];
                        var heroes = aggData.heroes;
                        for (var id in heroes)
                        {
                            var h = heroes[id];
                            heroes_list.push(h);
                        }
                        heroes_list.sort(function(a, b)
                        {
                            return b.games - a.games;
                        });
                        heroes_list.slice(0, info === "index" ? 30 : undefined);
                        cb(null, heroes_list);
                    }
                    else
                    {
                        return cb(null, []);
                    }
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
                        queries.getPlayerRatings(db, account_id, cb);
                    }
                    else
                    {
                        cb();
                    }
                },
                soloRating: function(cb)
                {
                    redis.zscore('solo_competitive_rank', account_id, cb);
                },
                partyRating: function(cb)
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
                    if (info === "histograms" || info === "records" || info === "trends" || info === "items" || info === "skills")
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
        if (id !== Number(player.account_id) && id !== constants.anonymous_account_id && (tm.games >= 5))
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
    //just get skill for last 20 matches (faster)
    var recents = matches.slice(0, 20);
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