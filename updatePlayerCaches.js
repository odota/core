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
        //TODO if we use this function for updating skill in player caches we don't want to upsert or overwrite the cache.data match
        upsert: true,
        //explicitly declare we want the pre-modification document
        "new": false
    }, function(err, doc) {
        if (err) {
            return cb(err);
        }
        var reInsert = doc && options.type === "api";
        //determine if we're reparsing this match
        var reParse = doc && doc.parsed_data && options.type === "parsed";
        //console.log("reInsert: %s, reParse: %s", reInsert, reParse);
        async.each(match.players, function(p, cb) {
                redis.get("player:" + p.account_id, function(err, result) {
                    //if player cache doesn't exist, skip
                    //if insignificant, skip
                    var cache = result && !err ? JSON.parse(zlib.inflateSync(new Buffer(result, 'base64'))) : null;
                    if (cache) {
                        //m.players[0] should be this player
                        //m.all_players should be all players
                        //duplicate this data into a copy to avoid corrupting original match object
                        var match_copy = JSON.parse(JSON.stringify(match));
                        match_copy.all_players = match.players.slice(0);
                        match_copy.players = [p];
                        //some data fields require computeMatchData in order to aggregate correctly
                        computeMatchData(match_copy);
                        //do aggregations only if significant and we didn't do them already
                        //console.log(isSignificant(constants, match_copy), reInsert, reParse);
                        if (isSignificant(constants, match_copy) && !reInsert && !reParse) {
                            //do aggregations on fields based on type
                            cache.aggData = aggregator([match_copy], options.type, cache.aggData);
                        }
                        //TODO it may be more performant to just push the match now and then deduplicate at view time (taking the last entry of each match_id to get state changes)
                        //add match to array
                        var ids = {};
                        //deduplicate matches by id
                        cache.data.forEach(function(m) {
                            ids[m.match_id] = m;
                        });
                        //update this match with latest state (parse_status/skill may have changed)
                        ids[match_copy.match_id] = reduceMatch(match_copy);
                        cache.data = [];
                        for (var key in ids) {
                            cache.data.push(ids[key]);
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
            cb);
    });
};