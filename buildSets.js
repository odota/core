var async = require('async');
var db = require('./db');
var r = require('./redis');
var redis = r.client;
var config = require('./config');
var retrieverConfig = config.RETRIEVER_HOST;
var parserConfig = config.PARSER_HOST;
var secret = config.RETRIEVER_SECRET;
module.exports = function buildSets(cb) {
    console.log("rebuilding sets");
    async.parallel({
        //players in this set have their matches parsed
        "trackedPlayers": function(cb) {
            redis.keys("visit:*", function(err, result) {
                var t = {};
                result.forEach(function(redis_key) {
                    var account_id = redis_key.split(":")[1];
                    t[account_id] = true;
                });
                //console.log(t);
                cb(err, t);
            });
        },
        //users in this set have their matches added
        "userPlayers": function(cb) {
            db.players.find({
                last_visited: {
                    $ne: null
                }
            }, {
                fields: {
                    "account_id": 1
                }
            }, function(err, docs) {
                if (err) {
                    return cb(err);
                }
                var t = {};
                docs.forEach(function(player) {
                    t[player.account_id] = true;
                });
                //console.log(t);
                cb(err, t);
            });
        },
        //users in this set are added to the trackedPlayers set
        "donators": function(cb) {
            db.players.find({
                cheese: {
                    $gt: 0
                }
            }, {
                fields: {
                    "account_id": 1
                }
            }, function(err, docs) {
                if (err) {
                    return cb(err);
                }
                var t = {};
                docs.forEach(function(player) {
                    t[player.account_id] = true;
                });
                //console.log(t);
                cb(err, t);
            });
        },
        "retrievers": function(cb) {
            var ps = retrieverConfig.split(",").map(function(r) {
                return "http://" + r + "?key=" + secret;
            });
            cb(null, ps);
        },
        "parsers": function(cb) {
            var ps = parserConfig.split(",").map(function(p) {
                return "http://" + p + "?key=" + secret;
            });
            cb(null, ps);
        }
    }, function(err, result) {
        if (err) {
            console.log('error occurred during buildSets: %s', err);
            return cb(err);
        }
        console.log('saving sets to redis');
        for (var key in result) {
            if (key === "trackedPlayers") {
                //add donators to set
                for (var key2 in result.donators) {
                    result.trackedPlayers[key2] = true;
                }
            }
            redis.set(key, JSON.stringify(result[key]));
        }
        console.log('set build complete');
        return cb(err);
    });
};