var advQuery = require('./advquery');
var utility = require('./utility');
var generatePositionData = utility.generatePositionData;
var constants = require('./constants.json');
var queries = require('./queries');
var async = require('async');
var r = require('./redis');
var redis = r.client;
module.exports = function fillPlayerData(account_id, options, cb) {
    //options.info, the tab the player is on
    //options.query, the query object to use in advQuery
    var cache;
    var player;
    var cachedTeammates;
    redis.get("player:" + account_id, function(err, result) {
        cache = result && !err ? JSON.parse(result) : null;
        cachedTeammates = cache && cache.aggData ? cache.aggData.teammates : null;
        var selectExists = Boolean(Object.keys(options.query.select).length);
        //console.log("cache conditions %s, %s, %s, %s", options.info !== "matches", cache, !selectExists, !options.query.js_agg);
        var cacheAble = options.info !== "matches" && cache && !selectExists;
        if (cacheAble) {
            options.query.limit = 10;
            options.query.js_agg = {};
        }

        options.query.select["players.account_id"] = account_id.toString();
        options.query.select["significant"] = options.query.select["significant"]==="" ? "" : "1";
        //sort results by match_id
        options.query.sort = options.query.sort || {
            match_id: -1
        };
        if (account_id === "all" || account_id === "professional") {
            options.query.select["players.account_id"] = "all";
            if (account_id === "professional") {
                options.query.select.leagueid = {
                    $gt: 0
                };
            }
        }
        else {
            //convert account id to number
            account_id = Number(account_id);
        }
        player = {
            account_id: account_id,
            personaname: account_id
        };
        advQuery(options.query, processResults);

        function processResults(err, results) {
            if (err) {
                return cb(err);
            }
            console.log("results: %s", results.data.length);
            //delete all_players from each match, remove parsedPlayer from each player, dump matches into js var, use datatables to generate table
            results.data.forEach(function reduceMatchData(m) {
                delete m.all_players;
                delete m.parsed_data;
                m.players.forEach(function(p) {
                    delete p.parsedPlayer;
                });
            });
            player.matches = results.data;
            if (cacheAble) {
                console.log("player cache hit %s", player.account_id);
                return finish(err);
            }
            else {
                //rebuild cache if no query and no cache
                //rebuild if loading matches tab (error correction)
                if ((!selectExists && !cache) || options.info === "matches") {
                    //set cache to data from advquery
                    cache = {
                        aggData: results.aggData
                    };
                    console.log("player cache miss, rebuilding %s", player.account_id);
                    redis.setex("player:" + player.account_id, 60 * 60 * 24 * 7, JSON.stringify(cache));
                    finish(err);
                }
                else {
                    //set cache to data from advquery
                    cache = {
                        aggData: results.aggData
                    };
                    //don't save the cache if there was a query
                    console.log("player cache miss, uncacheable %s", player.account_id);
                    finish(err);
                }
            }
        }

        function finish(err) {
            if (err) {
                return cb(err);
            }
            player.aggData = cache.aggData;
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