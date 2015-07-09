var advQuery = require('./advquery');
var utility = require('./utility');
var db = require('./db');
var generatePositionData = utility.generatePositionData;
var constants = require('./constants.json');
var queries = require('./queries');
var async = require('async');
var r = require('./redis');
var redis = r.client;
module.exports = function fillPlayerData(account_id, options, cb) {
    //retrieve the player from db by id
    var player = {
        account_id: account_id,
        personaname: account_id
    };
    redis.get("player:" + account_id, function(err, result) {
        player.cache = result && !err ? JSON.parse(result) : null;
        if (account_id === "all" || account_id === "professional") {
            options.query.select["players.account_id"] = "all";
            if (account_id === "professional") {
                options.query.select.leagueid = {
                    $gt: 0
                };
            }
            query();
        }
        else {
            account_id = Number(account_id);
            console.time("getting player from db " + account_id);
            db.players.findOne({
                account_id: account_id
            }, function(err, doc) {
                if (err || !doc) {
                    return cb(new Error("player not found"));
                }
                console.timeEnd("getting player from db " + account_id);
                //load the cache
                doc.cache = player.cache;
                player = doc;
                query();
            });
        }
    });

    function query() {
        //options.info, the tab the player is on
        //options.query, the query object to use in advQuery
        //defaults: this player, balanced modes only, put the defaults in options.query
        var queryExists = Boolean(Object.keys(options.query.select).length);
        var cacheAble = options.info && options.info !== "matches" && player.cache && !queryExists;
        options.query.limit = cacheAble ? 10 : options.query.limit;
        options.query.sort = {
            match_id: -1
        };
        var default_select = {
            "players.account_id": player.account_id.toString(),
            "significant": "1"
        };
        for (var key in default_select) {
            options.query.select[key] = options.query.select[key] || default_select[key];
        }
        advQuery(options.query, processResults);

        function processResults(err, results) {
            console.log("results: %s", results.data.length);
            //delete all_players from each match, remove parsedPlayer from each player, dump matches into js var, use datatables to generate table
            results.data.forEach(function reduceMatchData(m) {
                delete m.all_players;
                delete m.parsed_data;
                m.players.forEach(function(p) {
                    delete p.parsedPlayer;
                });
            });
            //use cache
            if (cacheAble) {
                console.log("using player cache %s", player.account_id);
                results.aggData = player.cache.aggData;
                return finish(err, results);
            }
            //rebuild cache if no query and no cache
            //also rebuild if loading matches tab (error correction)
            else if ((!queryExists && !player.cache) || options.info === "matches") {
                console.log("rebuilding cache %s", player.account_id);
                player.cache = {
                    aggData: results.aggData
                };
                redis.set("player:" + player.account_id, JSON.stringify(player.cache));
                finish(err, results);
            }
            //don't save the cache if there was a query
            else {
                console.log("not using or saving cache %s", player.account_id);
                finish(err, results);
            }
        }

        function finish(err, results) {
            if (err) {
                return cb(err);
            }
            var aggData = results.aggData;
            //get teammates, heroes, convert hashes to arrays and sort them
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
            async.parallel({
                teammate_list: function(cb) {
                    generateTeammateList(aggData.teammates ? aggData.teammates : null, cb);
                },
                all_teammate_list: function(cb) {
                    generateTeammateList(player.cache && player.cache.aggData && player.cache.aggData.teammates ? player.cache.aggData.teammates : null, cb);
                }
            }, function(err, lists) {
                player.all_teammate_list = lists.all_teammate_list;
                player.teammate_list = lists.teammate_list;
                player.matches = results.data;
                player.aggData = results.aggData;
                cb(err, player);
            });
        }

        function generateTeammateList(input, cb) {
            if (!input) {
                return cb(null, []);
            }
            var teammates_arr = [];
            var teammates = input;
            for (var id in teammates) {
                var tm = teammates[id];
                id = Number(id);
                //don't include if anonymous or if few games together
                if (id !== player.account_id && id !== constants.anonymous_account_id && tm.games >= 7) {
                    teammates_arr.push(tm);
                }
            }
            teammates_arr.sort(function(a, b) {
                return b.games - a.games;
            });
            console.time('teammate_lookup');
            queries.fillPlayerNames(teammates_arr, function(err) {
                console.timeEnd('teammate_lookup');
                cb(err, teammates_arr);
            });
        }
    }
};