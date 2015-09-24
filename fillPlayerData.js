var advQuery = require('./advquery');
var utility = require('./utility');
var generatePositionData = utility.generatePositionData;
var reduceMatch = utility.reduceMatch;
var constants = require('./constants.json');
var queries = require('./queries');
var config = require('./config');
var async = require('async');
var db = require('./db');
var r = require('./redis');
var redis = r.client;
var zlib = require('zlib');
var preprocessQuery = require('./preprocessQuery');
var filter = require('./filter');
var aggregator = require('./aggregator');
module.exports = function fillPlayerData(account_id, options, cb) {
    //options.info, the tab the player is on
    //options.query, the query object to use in advQuery
    var cache;
    var player = {
        account_id: account_id,
        personaname: account_id
    };
    var whitelist = {
        "all": 250
    };
    preprocessQuery(options.query);
    //set up mongo query in case we need it
    //convert account id to number and search db with it
    if (!isNaN(Number(account_id))) {
        options.query.mongo_select["players.account_id"] = Number(account_id);
        //match limit to retrieve for any player
        options.query.limit = 20000;
    }
    else if (account_id in whitelist) {
        options.query.limit = whitelist[account_id];
    }
    else {
        return cb("invalid account id");
    }
    //sort descending to get the most recent data
    options.query.sort = {
        match_id: -1
    };
    //check count of matches to validate cache
    console.time("count");
    db.matches.count({
        "players.account_id": Number(account_id)
    }, function(err, match_count) {
        if (err) {
            return cb(err);
        }
        console.timeEnd("count");
        //mongocaching doesn't work with "all" players since there is a conflict in account_id/match_id combination.
        //we end up only saving 200 matches to the cache, rather than the expanded set
        //additionally the count validation will always fail since a non-number account_id will return 0 results
        /*
        db.player_matches.find({
            account_id: account_id
        }, {
            sort: {
                match_id: 1
            }
        }, function(err, results) {
            if (err) {
                return cb(err);
            }
            cache = {
                data: results
            };
        */
        redis.get("player:" + account_id, function(err, result) {
            cache = result && !err ? JSON.parse(zlib.inflateSync(new Buffer(result, 'base64'))) : null;
            //unpack cache.data into an array
            if (cache && cache.data) {
                var arr = [];
                for (var key in cache.data) {
                    arr.push(cache.data[key]);
                }
                cache.data = arr;
            }
            account_id = Number(account_id);
            //the number of matches won't match if the account_id is string (all/professional)
            var cacheValid = cache && cache.data && ((cache.data.length && cache.data.length === match_count) || isNaN(account_id));
            console.log(match_count, cache ? cache.data.length : null);
            var cachedTeammates = cache && cache.aggData ? cache.aggData.teammates : null;
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
            //below code if we want to cache full matches (with parsed data)
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
                    return b.match_id - a.match_id;
                });
                //reduce matches to only required data for display
                //results.data is also reduced
                player.data = results.data.map(reduceMatch);
                player.aggData = results.aggData;
                player.all_teammates = cachedTeammates || player.aggData.teammates;
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
                async.series([getPlayerName, saveCache], function(err) {
                    cb(err, player);
                });

                function getPlayerName(cb) {
                    //get this player's name
                    var playerArr = [player];
                    queries.fillPlayerNames(playerArr, function(err) {
                        player = playerArr[0];
                        cb(err);
                    });
                }

                function saveCache(cb) {
                    //save cache
                    /*
                    if (!cacheValid && account_id !== constants.anonymous_account_id) {
                        //delete unnecessary data from match (parsed_data)
                        results.unfiltered.forEach(reduceMatch);
                        console.log("saving cache with length: %s", results.unfiltered.length);
                        async.each(results.unfiltered, function(match_copy, cb) {
                            //delete _id from the fetched match to prevent conflicts
                            delete match_copy._id;
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
                    if (!cacheValid && !filter_exists && account_id !== constants.anonymous_account_id) {
                        //pack data into hash for cache
                        var match_ids = {};
                        results.data.forEach(function(m) {
                            match_ids[m.match_id] = m;
                        });
                        cache = {
                            data: match_ids,
                            aggData: results.aggData
                        };
                        console.log("saving player cache %s", player.account_id);
                        console.time("deflate");
                        redis.setex("player:" + player.account_id, 60 * 60 * 24 * config.UNTRACK_DAYS, zlib.deflateSync(JSON.stringify(cache)).toString('base64'));
                        console.timeEnd("deflate");
                        return cb(null, player);
                    }
                    else {
                        return cb(null);
                    }
                }
            }
        });
    });
};
