var advQuery = require('./advquery');
var utility = require('./utility');
var constants = require('./constants.json');
var generatePositionData = utility.generatePositionData;
module.exports = function fillPlayerData(player, options, cb) {
    //options.info, the tab the player is on
    //options.query, the querystring from the user, pass these as select conditions
    if (options.info === "index" && player.cache) {
        //TODO if index page, try to use cached data (player.cache?)
        //player.cache.data capped collection of recent matches
        //player.cache.aggData.heroes
        //player.cache.aggData.teammates
        //player.cache.aggData.win
        //player.cache.aggData.lose
        //player.cache.aggData.games
        return finish(cb, player.cache);
    }
    //TODO if cache doesn't exist, build the cache
    //run advquery, slice results, cache aggData
    var js_agg = null;
    advQuery({
        select: options.query,
        project: null, //just project default fields
        js_agg: js_agg,
        js_sort: {
            match_id: -1
        }
    }, finish);

    function finish(err, results) {
        if (err) {
            return cb(err);
        }
        player.matches = results.data;
        //delete all_players from each match, remove parsedPlayer from each player, dump matches into js var, use datatables to generate table
        player.matches.forEach(function(m) {
            delete m.all_players;
            delete m.parsed_data;
            m.players.forEach(function(p) {
                delete p.parsedPlayer;
            });
        });
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
            aggData.heroes = heroes_arr;
        }
        if (aggData.teammates) {
            var teammates_arr = [];
            var teammates = aggData.teammates;
            for (var id in teammates) {
                var tm = teammates[id];
                id = Number(id);
                //don't include if anonymous or if less than 3 games
                if (id !== player.account_id && id !== constants.anonymous_account_id && tm.games >= 3) {
                    teammates_arr.push(tm);
                }
            }
            teammates_arr.sort(function(a, b) {
                return b.games - a.games;
            });
            aggData.teammates = teammates_arr;
        }
        player.aggData = results.aggData;
        if (player.aggData.obs) {
            //generally position data function is used to generate heatmap data for each player in a natch
            //we use it here to generate a single heatmap for aggregated counts
            player.obs = player.aggData.obs.counts;
            player.sen = player.aggData.sen.counts;
            var d = {
                "obs": true,
                "sen": true
            };
            generatePositionData(d, player);
            player.posData = [d];
        }
        cb(err, player);
    }
}