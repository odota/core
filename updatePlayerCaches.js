var utility = require('./utility');
var isSignificant = utility.isSignificant;
var constants = require('./constants.json');
var aggregator = require('./aggregator');
var async = require('async');
var db = require('./db');
var r = require('./redis');
var redis = r.client;
var computeMatchData = require('./compute').computeMatchData;
module.exports = function updatePlayerCaches(match, options, cb) {
    //check if match is a reinsert/reparse
    db.matches.find({
        match_id: match.match_id
    }, function(err, docs) {
        if (err) {
            return cb(err);
        }
        var reInsert = docs.length && options.type === "api";
        //determine if we're reparsing this match
        var reParse = docs.length && docs[0].parsed_data && options.type === "parsed";
        //console.log("reInsert: %s, reParse: %s", reInsert, reParse);
        if (reInsert || reParse) {
            return cb(err);
        }
        else {
            //insert players into db and update player caches
            async.each(match.players, function(p, cb) {
                    db.players.findOne({
                        account_id: p.account_id
                    }, function(err, player) {
                        if (err) {
                            return cb(err);
                        }
                        //if player cache doesn't exist, skip
                        //if insignificant, skip
                        //if this is a re-inserted match, skip
                        redis.get("player:" + p.account_id, function(err, result) {
                            player.cache = result && !err ? JSON.parse(result) : null;
                            if (player.cache && isSignificant(constants, match)) {
                                //m.players[0] should be this player
                                //m.all_players should be all players
                                //duplicate this data into a copy to avoid corrupting original match object
                                var match_copy = JSON.parse(JSON.stringify(match));
                                match_copy.all_players = match.players.slice(0);
                                match_copy.players = [p];
                                //some data fields require computeMatchData in order to aggregate correctly
                                computeMatchData(match_copy);
                                //do aggregations on fields based on type
                                player.cache.aggData = aggregator([match_copy], options.type, player.cache.aggData);
                                redis.set("player:" + p.account_id, JSON.stringify(player.cache));
                            }
                        });
                        db.players.update({
                            account_id: p.account_id
                        }, {
                            $set: {
                                account_id: p.account_id,
                            }
                        }, {
                            upsert: true
                        }, function(err) {
                            cb(err);
                        });
                    });
                },
                //done with all 10 players
                cb);
        }
    });
}