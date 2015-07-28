var utility = require('./utility');
var isSignificant = utility.isSignificant;
var reduceMatch = utility.reduceMatch;
var constants = require('./constants.json');
var aggregator = require('./aggregator');
var async = require('async');
var db = require('./db');
var r = require('./redis');
var redis = r.client;
var zlib = require('zlib');
var computeMatchData = require('./compute').computeMatchData;
module.exports = function updatePlayerCaches(match, options, cb) {
    //insert the match into db, then based on the existing document determine whether to do aggregations
    db.matches.findAndModify({
        match_id: match.match_id
    }, {
        $set: match
    }, {
        //don't upsert if inserting skill data
        upsert: options.type !== "skill",
        //explicitly declare we want the pre-modification document
        "new": false
    }, function(err, doc) {
        if (err) {
            return cb(err);
        }
        async.each(match.players || options.players, function(p, cb) {
                redis.get("player:" + p.account_id, function(err, result) {
                    //if player cache doesn't exist, skip
                    var cache = result && !err ? JSON.parse(zlib.inflateSync(new Buffer(result, 'base64'))) : null;
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
                            //deduplicate matches by id
                            var ids = {};
                            cache.data.forEach(function(m) {
                                ids[m.match_id] = m;
                            });
                            //reduce match for display
                            //TODO if we want to cache full data, we don't want to get rid of player.parsedPlayer
                            reduceMatch(match_copy);
                            var orig = ids[match_copy.match_id];
                            if (!orig) {
                                ids[match_copy.match_id] = match_copy;
                            }
                            else {
                                //check if we can update old values
                                //use new parse status if 2
                                orig.parse_status = match_copy.parse_status === 2 ? match_copy.parse_status : orig.parse_status;
                                //use new players[] if parse_status===2
                                orig.players = match_copy.parse_status === 2 ? match_copy.players : orig.players;
                            }
                            cache.data = [];
                            for (var key in ids) {
                                cache.data.push(ids[key]);
                            }
                        }
                        else {
                            //don't add to cache.data if inserting skill data, just loop through and update
                            cache.data.forEach(function(m) {
                                if (m.match_id === match_copy.match_id) {
                                    m.skill = match_copy.skill;
                                }
                            });
                        }
                        redis.setex("player:" + p.account_id, 60 * 60 * 24 * 7, zlib.deflateSync(JSON.stringify(cache)).toString('base64'));
                    }
                    /*
                    //temporarily disable inserting new players into db
                    db.players.update({
                        account_id: p.account_id
                    }, {
                        $set: {
                            account_id: p.account_id,
                        }
                    }, {
                        upsert: true
                    }, function(err) {
                        if (err) {
                            return cb(err);
                        }
                        cb(err);
                    });
                    */
                    cb(err);
                });
            },
            //done with all 10 players
            function(err) {
                if (err) {
                    return cb(err);
                }
                //clear the cache for this match
                redis.del("match:" + match.match_id, function(err){
                    return cb(err, doc);
                });
            });
    });
};