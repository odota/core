var db = require('./db');
var display = require('./display');
var computeMatchData = display.computeMatchData;
var filter = display.filter;
var aggregator = display.aggregator;
var utility = require('./utility');
var isRadiant = utility.isRadiant;
module.exports = function advQuery(options, cb) {
    //options passed:
    //select,the query to send to mongodb
    //project
    //filter,additional post-processing filters
    //limit
    //skip
    //sort
    //todo implement more features
    //api caps limit to prevent bandwidth abuse
    //no cap if calling internally
    //matches page, want matches fitting criteria
    //player matches page, want winrate, matches fitting criteria, also need to display player information
    //player trends page, want agregation on matches fitting criteria
    //client options should include:
    //filter: specific player/specific hero id
    //filter: specific player was also in the game (use players.account_id with $and, but which player gets returned by projection?  or could just do in js)
    //filter: specific hero was played by me, on my team, was against me, was in the game
    //filter: specific game modes
    //filter: specific patches
    //filter: specific regions
    //filter: no stats recorded (need to implement filter to detect)
    //filter: significant game modes only (balanced filter)
    //CAREFUL! during aggregation not all fields may exist (since we projected)
    //limit/skip are useful for datatables server-side ajax calls, but also prevent aggregation from working properly
    //aggData contains games/win/lose, useful for reporting winrate given a query
    //The problem with using datatables to interface with the api is that the query string suddenly gets a lot harder to build. 
    //do we even need a "general" matches page anymore?
    //Maybe we can add helpers to construct the query, use same advquery UI for:
    //matches tab (lists matches, reports winrate fitting the advanced query conditions)
    //trends tab (aggregates data fitting the advanced query conditions)
    if (options.select["players.account_id"]) {
        //convert the passed account id to number
        //todo run this on api end?
        options.select["players.account_id"] = Number(options.select["players.account_id"]);
    }
    if (options.select["players.account_id"] || options.select["players.hero_id"]) {
        //if selecting by account_id or hero_id, we project only that user in players array
        //todo add more cases where there's a single user to aggregate on
        //todo better detection condition, what if elemmatch syntax?
        options.project["players.$"] = 1;
    }
    //build the monk hash
    var monk = {
        limit: options.limit,
        skip: options.skip,
        sort: options.sort,
        fields: options.project
    };
    console.time('db');
    db.matches.find(options.select, monk, function(err, matches) {
        if (err) {
            console.log(err);
            return cb(err);
        }
        console.timeEnd('db');
        //console.time('compute');
        for (var i = 0; i < matches.length; i++) {
            computeMatchData(matches[i]);
        }
        //console.timeEnd('compute');
        //console.time('filter');
        var filtered = filter(matches, options.filter);
        //console.timeEnd('filter');
        //console.time('agg');
        var aggData = aggregator(filtered);
        //console.timeEnd('agg');
        //console.time('post');
        aggData.win = 0;
        aggData.lose = 0;
        aggData.games = 0;
        for (var i = 0; i < filtered.length; i++) {
            var m = filtered[i];
            aggData.games += 1;
            m.player_win ? aggData.win += 1 : aggData.lose += 1;
        }
        filtered.sort(function(a, b) {
            return b.match_id - a.match_id;
        });
        //console.timeEnd('post');
        var result = {
            aggData: aggData,
            data: filtered
        };
        cb(err, result);
    });
};