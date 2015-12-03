var express = require('express');
var players = express.Router();
var async = require('async');
var constants = require('../constants.js');
var queries = require("../queries");
var insertPlayerCache = queries.insertPlayerCache;
var getPlayerMatches = queries.getPlayerMatches;
var utility = require('../utility');
var generatePositionData = utility.generatePositionData;
var reduceMatch = utility.reduceMatch;
var config = require('../config');
var zlib = require('zlib');
var preprocessQuery = utility.preprocessQuery;
var filter = require('../filter');
var aggregator = require('../aggregator');
var compute = require('../compute');
var querystring = require('querystring');
var moment = require('moment');
var computePlayerMatchData = compute.computePlayerMatchData;
var subkeys = {
    "kills": 1,
    "deaths": 1,
    "assists": 1,
    "kda": 1,
    "gold_per_min": 1,
    "xp_per_min": 1,
    "last_hits": 1,
    "denies": 1,
    "lane_efficiency": 1,
    "duration": 1,
    "first_blood_time": 1,
    "level": 1,
    "hero_damage": 1,
    "tower_damage": 1,
    "hero_healing": 1,
    "stuns": 1,
    "tower_kills": 1,
    "neutral_kills": 1,
    "courier_kills": 1,
    "purchase_tpscroll": 1,
    "purchase_ward_observer": 1,
    "purchase_ward_sentry": 1,
    "purchase_gem": 1,
    "purchase_rapier": 1,
    "pings": 1,
    "throw": 1,
    "comeback": 1,
    "stomp": 1,
    "loss": 1,
    "actions_per_min": 1
};
//optimize by only projecting certain columns based on tab  set query.project based on info
//basic must contain anything a filter might use!
var basic = ['matches.match_id', 'hero_id', 'start_time', 'duration', 'kills', 'deaths', 'assists', 'player_slot', 'account_id', 'game_mode', 'lobby_type', 'match_skill.skill', 'parse_status', 'radiant_win', 'leaver_status', 'version', 'cluster', 'purchase', 'lane_pos'];
var advanced = ['last_hits', 'denies', 'gold_per_min', 'xp_per_min', 'gold_t', 'first_blood_time', 'level', 'hero_damage', 'tower_damage', 'hero_healing', 'stuns', 'killed', 'purchase', 'pings', 'radiant_gold_adv', 'actions'];
var others = ['pgroup', 'kill_streaks', 'multi_kills', 'obs', 'sen', 'purchase_log', 'item_uses', 'hero_hits', 'ability_uses', 'chat'];
var everything = basic.concat(advanced).concat(others);
var projections = {
    index: basic.concat('pgroup'),
    matches: basic,
    heroes: basic.concat('pgroup'),
    peers: basic.concat('pgroup'),
    activity: basic,
    histograms: basic.concat(advanced),
    records: basic.concat(advanced),
    counts: basic.concat(advanced),
    trends: basic.concat(advanced),
    sprees: basic.concat(['kill_streaks', 'multi_kills']),
    wardmap: basic.concat(['obs', 'sen']),
    items: basic.concat(['purchase_log', 'item_uses']),
    skills: basic.concat(['hero_hits', 'ability_uses']),
    wordcloud: basic.concat('chat'),
    rating: basic
};
var playerPages = constants.player_pages;
module.exports = function(db, redis)
{
    players.get('/:account_id/sqltest/:info?/:subkey?', function(req, res, next)
    {
        var account_id = req.params.account_id;
        db.raw('select hero_id, count(*) from player_matches where account_id = ? group by hero_id', [account_id]).asCallback(function(err, resp)
        {
            if (err)
            {
                return next(err);
            }
            res.json(resp);
        });
    });
    players.get('/:account_id/:info?/:subkey?', function(req, res, next)
    {
        console.time("player " + req.params.account_id);
        var info = playerPages[req.params.info] ? req.params.info : "index";
        var account_id = req.params.account_id;
        var query = req.query;
        var compare_data;
        if (Number(account_id) === constants.anonymous_account_id)
        {
            return next("cannot generate profile for anonymous account_id");
        }
        //copy the query in case we need the original for compare passing
        var qCopy = JSON.parse(JSON.stringify(query));
        async.series(
        {
            "player": function(cb)
            {
                fillPlayerData(account_id,
                {
                    info: info,
                    queryObj:
                    {
                        select: req.query,
                        project: config.ENABLE_PLAYER_CACHE ? everything : projections[info]
                    }
                }, cb);
            },
            "sets": function(cb)
            {
                queries.getSets(redis, cb);
            },
            "ratings": function(cb)
            {
                queries.getPlayerRatings(db, account_id, cb);
            }
        }, function(err, result)
        {
            if (err)
            {
                return next(err);
            }
            var player = result.player;
            var ratings = result.ratings || [];
            player.soloRating = ratings[0] ? ratings[ratings.length - 1].solo_competitive_rank : null;
            player.partyRating = ratings[0] ? ratings[ratings.length - 1].competitive_rank : null;
            player.ratings = ratings;
            var aggData = player.aggData;
            async.parallel(
            {
                //the array of teammates under the filter condition
                teammate_list: function(cb)
                {
                    generateTeammateArrayFromHash(aggData.teammates, player, cb);
                },
                /*
                all_teammate_list: function(cb) {
                    generateTeammateArrayFromHash(player.all_teammates, player, cb);
                }
                */
            }, function(err, lists)
            {
                if (err)
                {
                    return next(err);
                }
                player.teammate_list = lists.teammate_list;
                var teammate_ids = JSON.parse(JSON.stringify(lists.all_teammate_list || lists.teammate_list));
                //add custom tagged elements to teammate_ids, but ensure there are no duplicates.
                //remove self account id from query
                delete req.query.account_id;
                var ids = {};
                teammate_ids.forEach(function(t)
                {
                    ids[t.account_id] = 1;
                });
                for (var key in req.query)
                {
                    if (key.indexOf("account_id") !== -1 && req.query[key].constructor === Array)
                    {
                        req.query[key].forEach(function(id)
                        {
                            //iterate through array
                            //check for duplicates
                            //append to teammate_ids
                            if (!ids[id])
                            {
                                teammate_ids.unshift(
                                {
                                    account_id: Number(id),
                                    personaname: id
                                });
                            }
                            ids[id] = 1;
                        });
                    }
                }
                render();
                /*
                if (info === "compare") {
                    doCompare(qCopy, req.params.account_id.toString(), function(err, results) {
                        if (err) {
                            return next(err);
                        }
                        compare_data = results;
                        render();
                    });
                }
                else {
                    render();
                }
                */
                function render()
                {
                    console.timeEnd("player " + req.params.account_id);
                    if (req.query.json)
                    {
                        return res.json(result.player);
                    }
                    res.render("player/player_" + info,
                    {
                        q: req.query,
                        querystring: Object.keys(req.query).length ? "?" + querystring.stringify(req.query) : "",
                        route: info,
                        tabs: playerPages,
                        player: player,
                        trackedPlayers: result.sets.trackedPlayers,
                        //bots: result.sets.bots,
                        //ratingPlayers: result.sets.ratingPlayers,
                        histograms: subkeys,
                        subkey: req.params.subkey || "kills",
                        times:
                        {
                            "duration": 1,
                            "first_blood_time": 1
                        },
                        teammate_ids: teammate_ids,
                        compare_data: compare_data,
                        compare: info === "compare",
                        title: (player.personaname || player.account_id) + " - YASP"
                    });
                }
            });
        });
    });
    //return router
    return players;
    /*
        function doCompare(query, account_id, cb) {
            var account_ids = ["all", account_id];
            //var compareIds = query.compare_account_id;
            //compareIds = compareIds ? [].concat(compareIds) : [];
            //account_ids = account_ids.concat(compareIds).slice(0, 6);
            async.map(account_ids, function(account_id, cb) {
                //pass a copy of the original query, saved from before
                fillPlayerData(account_id, {
                    query: {
                        select: JSON.parse(JSON.stringify(query))
                    }
                }, function(err, player) {
                    console.log("computing averages %s", player.account_id);
                    //create array of results.aggData for each account_id
                    for (var key in histograms) {
                        //mean
                        //if (player.aggData[key].sum && player.aggData[key].n) {
                        //    player.aggData[key].avg = player.aggData[key].sum / player.aggData[key].n;
                        //}
                        //median
                        var arr = [];
                        for (var value in player.aggData[key].counts) {
                            for (var i = 0; i < player.aggData[key].counts[value]; i++) {
                                arr.push(Number(value));
                            }
                        }
                        arr.sort(function(a, b) {
                            return a - b;
                        });
                        player.aggData[key].avg = arr[Math.floor(arr.length / 2)];
                    }
                    cb(err, player);
                });
            }, function(err, results) {
                if (err) {
                    return cb(err);
                }
                console.time("computing percentiles");
                //compute percentile for each stat
                //for each stat average in each player's aggdata, iterate through all's stat counts and determine whether this average is gt/lt key, then add count to appropriate bucket. percentile is gt/(gt+lt)
                results.forEach(function(r, i) {
                    for (var key in histograms) {
                        var avg = results[i].aggData[key].avg;
                        var allCounts = results[0].aggData[key].counts;
                        var gt = 0;
                        var total = 0;
                        for (var value in allCounts) {
                            var valueCount = allCounts[value];
                            if (avg >= Number(value)) {
                                gt += valueCount;
                            }
                            total += valueCount;
                        }
                        results[i].aggData[key].percentile = total ? (gt / total) : 0;
                    }
                });
                console.timeEnd("computing percentiles");
                return cb(err, results);
            });
        }
    */
    function generateTeammateArrayFromHash(input, player, cb)
    {
        if (!input)
        {
            return cb();
        }
        console.time('teammate list');
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
            console.timeEnd('teammate list');
            cb(err, teammates_arr);
        });
    }

    function getPlayer(account_id, cb)
    {
        if (!isNaN(account_id))
        {
            db.first().from('players').where(
            {
                account_id: Number(account_id)
            }).asCallback(cb);
        }
        else
        {
            cb(null);
        }
    }

    function countPlayer(account_id, cb)
    {
        if (!isNaN(account_id))
        {
            console.time("count");
            db('player_matches').count().where(
            {
                account_id: Number(account_id)
            }).asCallback(function(err, count)
            {
                if (err)
                {
                    return cb(err);
                }
                count = Number(count[0].count);
                console.timeEnd("count");
                return cb(err, count);
            });
        }
        else
        {
            //non-integer account_id (all/professional)
            //don't return a count (always valid)
            cb(null);
        }
    }

    function fillPlayerData(account_id, options, cb)
    {
        //options.info, the tab the player is on
        //options.queryObj, the query object to use
        var cache;
        var cacheValid = false;
        //select player_matches with this account_id
        options.queryObj.select.account_id = account_id;
        options.queryObj = preprocessQuery(options.queryObj, constants);
        var filter_exists = Object.keys(options.queryObj.js_select).length;
        //try to find player in db
        getPlayer(account_id, function(err, player)
        {
            if (err)
            {
                return cb(err);
            }
            player = player ||
            {
                account_id: account_id,
                personaname: account_id
            };
            console.time('readcache');
            if (config.ENABLE_PLAYER_CACHE)
            {
                getCache();
            }
            else
            {
                cacheMiss();
            }

            function getCache()
            {
                redis.get(new Buffer("player:" + account_id), function(err, result)
                {
                    if (err)
                    {
                        console.log(err);
                    }
                    cache = result && config.ENABLE_PLAYER_CACHE ? JSON.parse(zlib.inflateSync(result)) : null;
                    console.timeEnd('readcache');
                    account_id = Number(account_id);
                    //unpack cache.data into an array
                    if (cache && cache.data)
                    {
                        var arr = [];
                        for (var key in cache.data)
                        {
                            arr.push(cache.data[key]);
                        }
                        cache.data = arr;
                        //check count of matches to validate cache
                        countPlayer(account_id, function(err, count)
                        {
                            if (err)
                            {
                                return cb(err);
                            }
                            //we return undefined count if the account_id is string (all/professional)
                            cacheValid = cache && cache.data && ((cache.data.length && cache.data.length === count) || count === undefined);
                            //var cachedTeammates = cache && cache.aggData && cacheValid ? cache.aggData.teammates : null;
                            if (cacheValid && !filter_exists)
                            {
                                console.log("player cache hit %s", player.account_id);
                                //fill in skill data from table since it is not cached
                                console.time('fillskill');
                                //get skill data for matches within cache expiry (might not have skill data)
                                var recents = cache.data.filter(function(m)
                                {
                                    return moment().diff(moment().unix(m.start_time), 'days') <= config.UNTRACK_DAYS;
                                });
                                var skillMap = {};
                                async.eachSeries(recents, function(match, cb)
                                {
                                    db.first(['match_id', 'skill']).from('match_skill').where(
                                    {
                                        match_id: match.match_id
                                    }).asCallback(function(err, row)
                                    {
                                        if (row && row.skill)
                                        {
                                            skillMap[match.match_id] = row.skill;
                                        }
                                        return cb(err);
                                    });
                                }, function(err)
                                {
                                    cache.data.forEach(function(m)
                                    {
                                        m.skill = m.skill || skillMap[m.match_id];
                                    });
                                    console.timeEnd('fillskill');
                                    processResults(err,
                                    {
                                        data: cache.data,
                                        aggData: cache.aggData,
                                        unfiltered: cache.data
                                    });
                                });
                            }
                            else
                            {
                                cacheMiss();
                            }
                        });
                    }
                    else
                    {
                        cacheMiss();
                    }
                });
            }

            function cacheMiss()
            {
                console.log("player cache miss %s", player.account_id);
                getPlayerMatches(db, options.queryObj, processResults);
            }

            function processResults(err, results)
            {
                if (err)
                {
                    return cb(err);
                }
                console.log("results: %s", results.data.length);
                //sort matches by descending match id for display
                results.data.sort(function(a, b)
                {
                    return Number(b.match_id) - Number(a.match_id);
                });
                //reduce matches to only required data for display
                player.data = results.data.map(reduceMatch);
                player.aggData = results.aggData;
                //player.all_teammates = cachedTeammates;
                //convert heroes hash to array and sort
                var aggData = player.aggData;
                if (aggData.heroes)
                {
                    var heroes_arr = [];
                    var heroes = aggData.heroes;
                    for (var id in heroes)
                    {
                        var h = heroes[id];
                        heroes_arr.push(h);
                    }
                    heroes_arr.sort(function(a, b)
                    {
                        return b.games - a.games;
                    });
                    player.heroes_list = heroes_arr;
                }
                if (aggData.obs)
                {
                    //generally position data function is used to generate heatmap data for each player in a natch
                    //we use it here to generate a single heatmap for aggregated counts
                    player.obs = aggData.obs.counts;
                    player.sen = aggData.sen.counts;
                    var d = {
                        "obs": true,
                        "sen": true
                    };
                    generatePositionData(d, player);
                    player.posData = [d];
                }
                //compute abandons
                player.abandons = 0;
                for (var key in player.aggData.leaver_status.counts)
                {
                    if (Number(key) >= 2)
                    {
                        player.abandons += player.aggData.leaver_status.counts[key];
                    }
                }
                saveCache(cb);
            }

            function saveCache(cb)
            {
                if (!cacheValid && !filter_exists && player.account_id !== constants.anonymous_account_id && config.ENABLE_PLAYER_CACHE)
                {
                    //pack data into hash for cache
                    var match_ids = {};
                    player.data.forEach(function(m)
                    {
                        var identifier = [m.match_id, m.player_slot].join(':');
                        match_ids[identifier] = m;
                    });
                    cache = {
                        data: match_ids,
                        aggData: player.aggData
                    };
                    //console.log(Object.keys(cache.data).length);
                    console.log("saving player cache %s", player.account_id);
                    console.time("writecache");
                    redis.setex(new Buffer("player:" + player.account_id), 60 * 60 * 24 * config.UNTRACK_DAYS, zlib.deflateSync(JSON.stringify(cache)));
                    //insertPlayerCache(db, player, cache, function(err, player) {
                    console.timeEnd("writecache");
                    return cb(err, player);
                    //});
                }
                else
                {
                    return cb(null, player);
                }
            }
        });
    }
};
