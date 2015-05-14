var advQuery = require('./advquery');
var utility = require('./utility');
var db = require('./db');
var generatePositionData = utility.generatePositionData;
module.exports = function fillPlayerData(account_id, options, cb) {
    //retrieve the player from db by id
    var player;
    if (account_id === "all" || account_id === "professional") {
        options.query.account_id = account_id;
        player = {
            account_id: account_id
        };
        if (account_id === "professional") {
            options.query.leagueid = options.query.leagueid || "gtzero";
        }
        query();
    }
    else {
        account_id = Number(account_id);
        db.players.findOne({
            account_id: account_id
        }, function(err, doc) {
            if (err || !doc) {
                return cb(new Error("player not found"));
            }
            player = doc;
            query();
        });
    }

    function query() {
        //options.info, the tab the user is on
        //options.query, the querystring from the user, pass these as select conditions
        //defaults: this player, balanced modes only, put the defaults in options.query
        var default_select = {
            "players.account_id": player.account_id.toString(),
            "significant": "1"
        };
        for (var key in default_select) {
            options.query[key] = options.query[key] || default_select[key];
        }
        advQuery({
            select: options.query,
            project: null, //just project default fields
            js_agg: options.info === "index" ? {
                "win": 1,
                "lose": 1,
                "games": 1,
                "matchups": 1,
                "teammates": 1
            } : null, //do all aggregations unless index
            js_sort: {
                match_id: -1
            }
        }, function(err, results) {
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
            player.aggData = results.aggData;
            if (player.aggData.obs) {
                //generally position data function is used to generate heatmap data for each player in a match
                //we use it here to generate a single heatmap for aggregated counts of heatmap data for multiple matches of a player
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
        });
    }
};
