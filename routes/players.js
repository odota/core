var express = require('express');
var players = express.Router();
var async = require('async');
var constants = require('../constants.js');
var queries = require("../queries");
var utility = require('../utility');
var generatePositionData = utility.generatePositionData;
var reduceMatch = utility.reduceMatch;
var config = require('../config');
var zlib = require('zlib');
var preprocessQuery = require('../preprocessQuery');
var filter = require('../filter');
var aggregator = require('../aggregator');
var compute = require('../compute');
var computePlayerMatchData = compute.computePlayerMatchData;
var histograms = {
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
var playerPages = constants.player_pages;
module.exports = function(db, redis) {
    players.get('/:account_id/:info?/:subkey?', function(req, res, next) {
        console.time("player " + req.params.account_id);
        var info = playerPages[req.params.info] ? req.params.info : "index";
        var account_id = req.params.account_id;
        var query = req.query;
        var compare_data;
        //copy the query in case we need the original for compare passing
        var qCopy = JSON.parse(JSON.stringify(query));
        async.series({
            "player": function(cb) {
                fillPlayerData(account_id, {
                    info: info,
                    query: {
                        select: req.query
                    }
                }, cb);
            },
            "sets": function(cb) {
                queries.getSets(redis, cb);
            },
            "ratings": function getPlayerRatings(cb) {
                if (!isNaN(account_id)) {
                    db.from('player_ratings').where({
                        account_id: Number(account_id)
                    }).orderBy('time', 'asc').asCallback(cb);
                }
                else {
                    cb();
                }
            }
        }, function(err, result) {
            if (err) {
                return next(err);
            }
            var player = result.player;
            var ratings = result.ratings || [];
            player.soloRating = ratings[0] ? ratings[ratings.length - 1].solo_competitive_rank : null;
            player.partyRating = ratings[0] ? ratings[ratings.length - 1].competitive_rank : null;
            player.ratings = ratings;
            var aggData = player.aggData;
            async.parallel({
                //the array of teammates under the filter condition
                teammate_list: function(cb) {
                    generateTeammateArrayFromHash(aggData.teammates, player, cb);
                },
                /*
                all_teammate_list: function(cb) {
                    generateTeammateArrayFromHash(player.all_teammates, player, cb);
                }
                */
            }, function(err, lists) {
                if (err) {
                    return next(err);
                }
                player.teammate_list = lists.teammate_list;
                var teammate_ids = lists.all_teammate_list || lists.teammate_list;
                //add custom tagged elements to teammate_ids, but ensure there are no duplicates.
                var ids = {};
                teammate_ids.forEach(function(t) {
                    ids[t.account_id] = 1;
                });
                for (var key in req.query) {
                    if (key.indexOf("account_id") !== -1 && req.query[key].constructor === Array) {
                        req.query[key].forEach(function(id) {
                            //iterate through array
                            //check for duplicates
                            //append to teammate_ids
                            if (!ids[id]) {
                                teammate_ids.unshift({
                                    account_id: Number(id),
                                    personaname: id
                                });
                            }
                            ids[id] = 1;
                        });
                    }
                }
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

                function render() {
                    console.timeEnd("player " + req.params.account_id);
                    if (req.query.json) {
                        return res.json(result.player);
                    }
                    res.render("player/player_" + info, {
                        q: req.query,
                        route: info,
                        tabs: playerPages,
                        player: player,
                        trackedPlayers: result.sets.trackedPlayers,
                        //bots: result.sets.bots,
                        //ratingPlayers: result.sets.ratingPlayers,
                        histograms: histograms,
                        subkey: req.params.subkey || "kills",
                        times: {
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
    return players;

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
                    /*
                    //mean
                    if (player.aggData[key].sum && player.aggData[key].n) {
                        player.aggData[key].avg = player.aggData[key].sum / player.aggData[key].n;
                    }
                    */
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

    function generateTeammateArrayFromHash(input, player, cb) {
        if (!input) {
            return cb();
        }
        console.time('teammate list');
        var teammates_arr = [];
        var teammates = input;
        for (var id in teammates) {
            var tm = teammates[id];
            id = Number(id);
            //don't include if anonymous, self or if few games together
            if (id !== Number(player.account_id) && id !== constants.anonymous_account_id && (tm.games >= 5)) {
                teammates_arr.push(tm);
            }
        }
        teammates_arr.sort(function(a, b) {
            return b.games - a.games;
        });
        //limit to 200 max players
        teammates_arr = teammates_arr.slice(0, 200);
        async.each(teammates_arr, function(t, cb) {
            db.first().from('players').where({
                account_id: t.account_id
            }).asCallback(function(err, row) {
                if (err || !row) {
                    return cb(err);
                }
                t.personaname = row.personaname;
                t.last_login = row.last_login;
                t.avatar = row.avatar;
                cb(err);
            });
        }, function(err) {
            console.timeEnd('teammate list');
            cb(err, teammates_arr);
        });
    }

    function findPlayer(account_id, cb) {
        if (!isNaN(account_id)) {
            db.first().from('players').where({
                account_id: Number(account_id)
            }).asCallback(cb);
        }
        else {
            cb(null);
        }
    }

    function countPlayer(account_id, cb) {
        //10% chance to autorefresh cache in production
        if (Math.random() < (config.NODE_ENV === "production" ? 0.1 : 0)) {
            //return a 0 count (always invalid)
            cb(null, 0);
        }
        else if (!isNaN(account_id)) {
            console.time("count");
            db('player_matches').count('match_id').where({
                account_id: Number(account_id)
            }).asCallback(function(err, count) {
                if (err) {
                    return cb(err);
                }
                count = Number(count[0].count);
                console.timeEnd("count");
                return cb(err, count);
            });
        }
        else {
            //don't return a count (always valid)
            cb(null);
        }
    }

    function fillPlayerData(account_id, options, cb) {
        //options.info, the tab the player is on
        //options.query, the query object to use
        var cache;
        options.query.select.account_id = account_id;
        options.query = preprocessQuery(options.query);
        if (!options.query) {
            return cb("invalid account_id");
        }
        //try to find player in db
        findPlayer(account_id, function(err, player) {
            if (err) {
                return cb(err);
            }
            player = player || {
                account_id: account_id,
                personaname: account_id
            };
            redis.get(new Buffer("player:" + account_id), function(err, result) {
                console.time('inflate');
                cache = result && !err ? JSON.parse(zlib.inflateSync(result)) : null;
                console.timeEnd('inflate');
                //unpack cache.data into an array
                if (cache && cache.data) {
                    var arr = [];
                    for (var key in cache.data) {
                        arr.push(cache.data[key]);
                    }
                    cache.data = arr;
                }
                account_id = Number(account_id);
                //check count of matches to validate cache
                countPlayer(account_id, function(err, count) {
                    if (err) {
                        return cb(err);
                    }
                    //we return a count of 0 if the account_id is string (all/professional)
                    var cacheValid = cache && cache.data && ((cache.data.length && cache.data.length === count) || count === undefined);
                    var cachedTeammates = cache && cache.aggData && cacheValid ? cache.aggData.teammates : null;
                    var filter_exists = Object.keys(options.query.js_select).length;
                    if (cacheValid && !filter_exists) {
                        console.log("player cache hit %s", player.account_id);
                        processResults(err, {
                            data: cache.data,
                            aggData: cache.aggData,
                            unfiltered: cache.data
                        });
                    }
                    /*
                    //full match cache code
                    if (cacheValid) {
                        console.log("player cache hit %s", player.account_id);
                        //cached data should come in ascending match order
                        var filtered = filter(cache.data, options.query.js_select);
                        cache.aggData = aggregator(filtered, null);
                        processResults(err, {
                            data: filtered,
                            aggData: cache.aggData,
                            unfiltered: cache.data
                        });
                    }
                    */
                    else {
                        console.log("player cache miss %s", player.account_id);
                        advQuery(options.query, processResults);
                    }

                    function processResults(err, results) {
                        if (err) {
                            return cb(err);
                        }
                        console.log("results: %s", results.data.length);
                        //sort matches by descending match id for display
                        results.data.sort(function(a, b) {
                            return Number(b.match_id) - Number(a.match_id);
                        });
                        //reduce matches to only required data for display
                        player.data = results.data.map(reduceMatch);
                        player.aggData = results.aggData;
                        player.all_teammates = cachedTeammates;
                        //convert heroes hash to array and sort
                        var aggData = player.aggData;
                        if (aggData.heroes) {
                            var heroes_arr = [];
                            var heroes = aggData.heroes;
                            for (var id in heroes) {
                                var h = heroes[id];
                                heroes_arr.push(h);
                            }
                            heroes_arr.sort(function(a, b) {
                                return b.games - a.games;
                            });
                            player.heroes_list = heroes_arr;
                        }
                        if (aggData.obs) {
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
                        for (var key in player.aggData.leaver_status.counts) {
                            if (Number(key) >= 2) {
                                player.abandons += player.aggData.leaver_status.counts[key];
                            }
                        }
                        async.series([saveCache], function(err) {
                            cb(err, player);
                        });
                    }

                    function saveCache(cb) {
                        //full match cache code, needs ref to unfiltered data to save
                        /*
                        if (!cacheValid && account_id !== constants.anonymous_account_id && config.ENABLE_PLAYER_CACHE) {
                            results.unfiltered.forEach(reduceMatch);
                            console.log("saving cache with length: %s", results.unfiltered.length);
                            async.each(results.unfiltered, function(match_copy, cb) {
                                db.player_matches.update({
                                    account_id: account_id,
                                    match_id: match_copy.match_id
                                }, {
                                    $set: match_copy
                                }, {
                                    upsert: true
                                }, cb);
                            }, cb);
                        }
                        */
                        if (!cacheValid && !filter_exists && account_id !== constants.anonymous_account_id && config.ENABLE_PLAYER_CACHE) {
                            //pack data into hash for cache
                            var match_ids = {};
                            player.data.forEach(function(m) {
                                var identifier = [m.match_id, m.player_slot].join(':');
                                match_ids[identifier] = m;
                            });
                            cache = {
                                data: match_ids,
                                aggData: player.aggData
                            };
                            console.log("saving player cache %s", player.account_id);
                            console.time("deflate");
                            redis.setex(new Buffer("player:" + player.account_id), 60 * 60 * 24 * config.UNTRACK_DAYS, zlib.deflateSync(JSON.stringify(cache)));
                            console.timeEnd("deflate");
                            var fs = require('fs');
                            fs.writeFileSync("output.json", JSON.stringify(cache));
                            return cb(null, player);
                        }
                        else {
                            return cb(null);
                        }
                    }
                });
            });
        });
    }

    function advQuery(query, cb) {
        console.log(query);
        console.time('getting player_matches');
        db.from('player_matches').where(query.db_select).limit(query.limit).orderBy('player_matches.match_id', 'desc').innerJoin('matches', 'player_matches.match_id', 'matches.match_id').asCallback(function(err, player_matches) {
            if (err) {
                return cb(err);
            }
            console.timeEnd('getting player_matches');
            console.time('computing aggregations');
            //compute, filter, agg should act on player_matches joined with matches
            player_matches.forEach(function(m) {
                //post-process the match to get additional stats
                computePlayerMatchData(m);
            });
            console.time('getting fellows');
            //get fellow players and pass to aggregator/filter
            db.select(['match_id', 'account_id', 'hero_id', 'player_slot']).from('player_matches').whereIn('match_id', player_matches.map(function(pm) {
                return pm.match_id;
            })).asCallback(function(err, fellows) {
                if (err) {
                    return cb(err);
                }
                console.timeEnd('getting fellows');
                //group the fellows by match_id, map to array of players in that match
                var groups = {};
                fellows.forEach(function(f) {
                    if (!groups[f.match_id]) {
                        groups[f.match_id] = [];
                    }
                    groups[f.match_id].push(f);
                });
                var filtered = filter(player_matches, groups, query.js_select);
                //filtered = sort(filtered, options.js_sort);
                var aggData = aggregator(filtered, groups, query.js_agg);
                var result = {
                    aggData: aggData,
                    page: filtered.slice(query.js_skip, query.js_skip + query.js_limit),
                    data: filtered,
                    unfiltered: player_matches
                };
                console.timeEnd('computing aggregations');
                cb(err, result);
            });
        });
    }
};