var async = require('async');
var db = require('../db');
var r = require('../redis');
var redis = r.client;
var moment = require('moment');
var config = require('../config');
module.exports = function buildSets(cb) {
    console.log("rebuilding sets");
    async.parallel({
        "trackedPlayers": function(cb) {
            db.players.find({
                last_visited: {
                    $gt: moment().subtract(config.UNTRACK_DAYS, 'day').toDate()
                }
            }, {
                fields: {
                    "cache": 0
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
                redis.set("trackedPlayers", JSON.stringify(t));
                cb(err, t);
            });
        },
        "userPlayers": function(cb) {
            db.players.find({
                last_visited: {
                    $ne: null
                }
            }, {
                fields: {
                    "cache": 0
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
                redis.set("userPlayers", JSON.stringify(t));
                cb(err, t);
            });
        },
        "donators": function(cb) {
            db.players.find({
                cheese: {
                    $gt: 0
                }
            }, {
                fields: {
                    "cache": 0
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
                redis.set("donators", JSON.stringify(t));
                cb(err, t);
            });
        }
    }, function(err, result) {
        if (err) {
            console.log('error occured during buildSets: %s', err);
        }
        //merge trackedPlayers with donators
        //we are doing this because the $or query forces iteration through all players, which is slow!
        for (var key in result.donators) {
            result.trackedPlayers[key] = true;
        }
        return cb(err);
    });
};