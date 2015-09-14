var utility = require('./utility');
var reduceMatch = utility.reduceMatch;
var aggregator = require('./aggregator');
var async = require('async');
var config = require('./config');
var db = require('./db');
var r = require('./redis');
var redis = r.client;
var zlib = require('zlib');
var computeMatchData = require('./compute').computeMatchData;
module.exports = function updatePlayerCaches(match, options, cb) {
    //insert the match into db, then based on the existing document determine whether to do aggregations
    //TODO don't want to overwrite parse_status: 2 (parsed) (e.g., if an existing parsed match is expired when re-requested)
    //this is likely somewhat messed up in production already, although we could run a script to clean it up
    db.matches.findAndModify({
        match_id: match.match_id
    }, {
        $set: match
    }, {
        //don't upsert if inserting skill data
        upsert: options.type !== "skill",
        //explicitly declare we want the pre-modification document in the cb
        "new": false
    }, function(err, doc) {
        if (err) {
            return cb(err);
        }
        if (options.type === "skill" && !doc) {
            //we didn't add skill data because we didn't have this match in db, return immediately
            return cb(err);
        }
        async.each(match.players || options.players, function(p, cb) {
                //full mongo cache
                var match_copy = JSON.parse(JSON.stringify(match));
                if (options.type !== "skill") {
                    //m.players[0] should be this player
                    //m.all_players should be all players
                    //duplicate this data into a copy to avoid corrupting original match object
                    match_copy.all_players = match.players.slice(0);
                    match_copy.players = [p];
                    //computeMatchData takes the parsed_data and creates a parsedPlayer for each player in a parallel array
                    computeMatchData(match_copy);
                    reduceMatch(match_copy);
                }
                db.player_matches.update({
                    account_id: p.account_id,
                    match_id: match_copy.match_id
                }, {
                    $set: match_copy
                }, {
                    upsert: true
                }, function(err) {
                    if (err) {
                        return cb(err);
                    }
                    return insertPlayers(cb);
                });
                /*
                //aggregate redis cache
                    redis.get("player:" + p.account_id, function(err, result) {
                        if (err) {
                            return cb(err);
                        }
                        //if player cache doesn't exist, skip
                        var cache = result ? JSON.parse(zlib.inflateSync(new Buffer(result, 'base64'))) : null;
                        if (cache) {
                            var match_copy = JSON.parse(JSON.stringify(match));
                            if (options.type !== "skill") {
                                //m.players[0] should be this player
                                //m.all_players should be all players
                                //duplicate this data into a copy to avoid corrupting original match object
                                match_copy.all_players = match.players.slice(0);
                                match_copy.players = [p];
                                //some data fields require computeMatchData in order to aggregate correctly
                                computeMatchData(match_copy);
                                //check for doc.players containing this match_id
                                //we could need to run aggregation if we are reinserting a match but this player used to be anonymous
                                var playerInMatch = doc && doc.players && doc.players.some(function(player) {
                                    return player.account_id === p.account_id;
                                });
                                var reInsert = doc && options.type === "api" && playerInMatch;
                                //determine if we're reparsing this match		
                                var reParse = doc && doc.parsed_data && options.type === "parsed";
                                if (!reInsert && !reParse && cache.aggData) {
                                    //do aggregations on fields based on type		
                                    cache.aggData = aggregator([match_copy], options.type, cache.aggData);
                                }
                                //reduce match for display
                                //if we want to cache full data, we don't want to get rid of player.parsedPlayer in the match_copy
                                reduceMatch(match_copy);
                            }
                            var orig = cache.data[match_copy.match_id];
                            if (!orig) {
                                cache.data[match_copy.match_id] = match_copy;
                            }
                            else {
                                for (var key in match_copy) {
                                    orig[key] = match_copy[key];
                                }
                            }
                            redis.ttl("player:" + p.account_id, function(err, ttl) {
                                if (err) {
                                    return cb(err);
                                }
                                redis.setex("player:" + p.account_id, Number(ttl) > 0 ? Number(ttl) : 24 * 60 * 60 * config.UNTRACK_DAYS, zlib.deflateSync(JSON.stringify(cache)).toString('base64'));
                            });
                        }
                        return insertPlayers(cb);
                        //return cb(err);
                    });
                    */
                function insertPlayers(cb) {
                    //insert all players into db to ensure they exist and we can fetch their personaname later
                    db.players.update({
                        account_id: p.account_id
                    }, {
                        $set: {
                            account_id: p.account_id,
                        }
                    }, {
                        upsert: true
                    }, function(err) {
                        return cb(err);
                    });
                }
            },
            //done with all 10 players
            function(err) {
                if (err) {
                    return cb(err);
                }
                //clear the match cache
                redis.del("match:" + match.match_id, function(err) {
                    return cb(err, doc);
                });
            });
    });
};
