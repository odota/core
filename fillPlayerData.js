var advQuery = require('./advquery');
var utility = require('./utility');
var generatePositionData = utility.generatePositionData;
var reduceMatch = utility.reduceMatch;
var constants = require('./constants.json');
var queries = require('./queries');
var async = require('async');
var db = require('./db');
var r = require('./redis');
var redis = r.client;
var zlib = require('zlib');
module.exports = function fillPlayerData(account_id, options, cb) {
    //options.info, the tab the player is on
    //options.query, the query object to use in advQuery
    var cache;
    var player;
    var cachedTeammates;
    var exceptions = 0;
    var keywords = {
        "compare_account_id": 1,
        "json": 1
    };
    for (var key in options.query.select) {
        if (options.query.select[key] === "") {
            delete options.query.select[key];
        }
        else {
            options.query.select[key] = [].concat(options.query.select[key]).map(function(e) {
                return Number(e);
            });
        }
        if (key in keywords) {
            exceptions += 1;
        }
    }
    redis.get("player:" + account_id, function(err, result) {
        console.time("inflate");
        cache = result && !err ? JSON.parse(zlib.inflateSync(new Buffer(result, 'base64'))) : null;
        console.timeEnd("inflate");
        cachedTeammates = cache && cache.aggData ? cache.aggData.teammates : null;
        var selectExists = Boolean(Object.keys(options.query.select).length > exceptions);
        player = {
            account_id: account_id,
            personaname: account_id
        };
        //console.log("cache conditions %s, %s, %s, %s", options.info !== "matches", cache, !selectExists, !options.query.js_agg);
        var cacheAble = cache && !selectExists;
        if (cacheAble) {
            console.log("player cache hit %s", player.account_id);
            //sort cached matches by descending match id
            cache.data.sort(function(a, b) {
                return b.match_id - a.match_id;
            });
            console.time("retrieving skill data");
            //cache does not contain skill data since it's added after the original insert!
            //we can do db lookups for skill data (or only go until we hit a match with skill data)
            //or store skill data in redis for fast lookups?
            async.each(cache.data, function(match, cb) {
                redis.get("skill:" + match.match_id, function(err, result) {
                    if (err) {
                        return cb(err);
                    }
                    if (result) {
                        match.skill = Number(result);
                    }
                    cb(err);
                });
            }, function(err) {
                console.timeEnd("retrieving skill data");
                processResults(err, cache);
            });
        }
        else {
            console.log("player cache miss %s", player.account_id);
            //convert account id to number and search db with it
            //don't do this if the account id is not a number (all or professional)
            if (!isNaN(Number(account_id))) {
                options.query.select["players.account_id"] = Number(account_id);
                //set a larger limit since we are only getting one player's matches
                options.query.limit = 20000;
            }
            else {
                options.query.limit = 1000;
            }
            //sort results by match_id
            options.query.sort = options.query.sort || {
                match_id: -1
            };
            advQuery(options.query, processResults);
        }

        function processResults(err, results) {
            if (err) {
                return cb(err);
            }
            console.log("results: %s", results.data.length);
            //reduce matches to only required data for display
            results.data = results.data.map(reduceMatch);
            player.data = results.data;
            player.aggData = results.aggData;
            if (!selectExists && !options.query.js_agg) {
                //resave cache if no query and full aggregations
                cache = {
                    aggData: results.aggData,
                    data: results.data
                };
                console.log("saving player cache %s", player.account_id);
                redis.setex("player:" + player.account_id, 60 * 60 * 24 * 7, zlib.deflateSync(JSON.stringify(cache)).toString('base64'));
                finish(err);
            }
            else {
                //don't save the cache if there was a query
                console.log("not saving player cache %s", player.account_id);
                finish(err);
            }
        }

        function finish(err) {
            if (err) {
                return cb(err);
            }
            var aggData = player.aggData;
            //convert hashes to arrays and sort them for display
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
            player.all_teammates = cachedTeammates || aggData.teammates;
            var playerArr = [player];
            queries.fillPlayerNames(playerArr, function(err) {
                var player = playerArr[0];
                cb(err, player);
            });
        }
    });
};