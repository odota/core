var advQuery = require('./advquery');
var utility = require('./utility');
var generatePositionData = utility.generatePositionData;
module.exports = function fillPlayerData(player, options, cb) {
    //received from controller
    //options.info, the tab the player is on
    var js_agg = null;
    /*
    if (options.info === "index") {
        //index is loaded via ajax
        return cb(null, player);
        //js_agg = {};
    }
    */
    //options.query, the querystring from the user, pass these as select conditions
    advQuery({
        select: options.query,
        project: null, //just project default fields
        js_agg: js_agg,
        js_sort: {
            match_id: -1
        }
    }, function(err, results) {
        if (err) {
            return cb(err);
        }
        player.matches = results.data;
        //delete all_players from each match, dump matches into js var, use datatables to generate table
        player.matches.forEach(function(m) {
            delete m.all_players;
        });
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
    });
}