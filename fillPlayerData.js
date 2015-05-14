var advQuery = require('./advquery');
var utility = require('./utility');
var generatePositionData = utility.generatePositionData;
module.exports = function fillPlayerData(player, options, cb) {
    //options.info, the tab the user is on
    //options.query, the querystring from the user, pass these as select conditions
    advQuery({
        select: options.query,
        project: null, //just project default fields
        js_agg: options.info==="index" ? {} : null, //do all aggregations unless index
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
            //generally position data function is used to generate heatmap data for each player in a natch
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