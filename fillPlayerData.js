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
var preprocessQuery = require('./preprocessQuery');
var filter = require('./filter');
var aggregator = require('./aggregator');
module.exports = function fillPlayerData(account_id, options, cb) {
    //options.info, the tab the player is on
    //options.query, the query object to use in advQuery
    var cache;
    var player;
    var cachedTeammates;
    redis.get("player:" + account_id, function(err, result) {
        console.time("inflate");
        cache = result && !err ? JSON.parse(zlib.inflateSync(new Buffer(result, 'base64'))) : null;
        console.timeEnd("inflate");
        player = {
            account_id: account_id,
            personaname: account_id
        };
        if (cache) {
            console.log("player cache hit %s", player.account_id);
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
                preprocessQuery(options.query);
                cachedTeammates = aggregator(cache.data, null).teammates;
                var filtered = filter(cache.data, options.query.js_select);
                processResults(err, {
                    data: filtered,
                    aggData: aggregator(filtered, null),
                    unfiltered: cache.data
                });
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
            advQuery(options.query, processResults);
        }

        function processResults(err, results) {
            if (err) {
                return cb(err);
            }
            //resave cache
            cache = {
                data: results.unfiltered
            };
            console.log("saving player cache %s", player.account_id);
            console.time("deflate");
            redis.setex("player:" + player.account_id, 60 * 60 * 24 * 7, zlib.deflateSync(JSON.stringify(cache)).toString('base64'));
            console.timeEnd("deflate");
            console.log("results: %s", results.data.length);
            //sort matches by descending match id
            results.data.sort(function(a, b) {
                return b.match_id - a.match_id;
            });
            //reduce matches to only required data for display
            player.data = results.data.map(reduceMatch);
            player.aggData = results.aggData;
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
            player.all_teammates = cachedTeammates || aggData.teammates;
            var playerArr = [player];
            queries.fillPlayerNames(playerArr, function(err) {
                var player = playerArr[0];
                cb(err, player);
            });
        }
    });
};