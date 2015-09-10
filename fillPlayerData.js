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
    var player;
    var cachedTeammates;
    preprocessQuery(options.query);
    redis.get("player:" + account_id, function(err, result) {
        console.time("inflate");
        cache = result && !err ? JSON.parse(zlib.inflateSync(new Buffer(result, 'base64'))) : null;
        console.timeEnd("inflate");
        cachedTeammates = cache && cache.aggData ? cache.aggData.teammates : null;
        var filter_exists = Object.keys(options.query.js_select).length;
        player = {
            account_id: account_id,
            personaname: account_id
        };
        if (cache && !filter_exists) {
            console.log("player cache hit %s", player.account_id);
            //var filtered = filter(cache.data, options.query.js_select);
            //var aggData = aggregator(filtered, null);
            //unpack cache.data into an array
            var arr = [];
            for (var key in cache.data) {
                arr.push(cache.data[key]);
            }
            cache.data = arr;
            /*
            //below code if we want to cache full matches (with parsed data)
            var filtered = filter(cache.data, options.query.js_select);
            cache.aggData = aggregator(filtered, null);
            processResults(err, {
                data: filtered,
                aggData: cache.aggData,
                unfiltered: cache.data
            });
            */
            processResults(err, {
                data: cache.data,
                aggData: cache.aggData,
                unfiltered: cache.data
            });
        }
        else {
            console.log("player cache miss %s", player.account_id);
            //convert account id to number and search db with it
            //don't do this if the account id is not a number (all or professional)
            if (!isNaN(Number(account_id))) {
                options.query.mongo_select["players.account_id"] = Number(account_id);
                //set a larger limit since we are only getting one player's matches
                options.query.limit = 20000;
            }
            else {
                options.query.limit = 200;
            }
            options.query.sort = {
                match_id: -1
            };
            advQuery(options.query, processResults);
        }

        function processResults(err, results) {
            if (err) {
                return cb(err);
            }
            //sort matches by descending match id
            results.data.sort(function(a, b) {
                return b.match_id - a.match_id;
            });
            //reduce matches to only required data for display, also shrinks the data for cache resave
            player.data = results.data.map(reduceMatch);
            //results.unfiltered.forEach(reduceMatch);
            if (!cache && !filter_exists && player.account_id !== constants.anonymous_account_id) {
                //pack data into hash for cache
                var match_ids = {};
                results.data.forEach(function(m) {
                    match_ids[m.match_id] = m;
                });
                //save cache
                /*
                //code to save full matches (unfiltered, with parsed data)
                cache = {
                    data: results.unfiltered,
                };
                */
                cache = {
                    data: match_ids,
                    aggData: results.aggData
                };
                console.log("saving player cache %s", player.account_id);
                console.time("deflate");
                redis.setex("player:" + player.account_id, 60 * 60 * 24 * config.UNTRACK_DAYS, zlib.deflateSync(JSON.stringify(cache)).toString('base64'));
                console.timeEnd("deflate");
            }
            console.log("results: %s", results.data.length);
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
