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
            console.log(err);
            console.log('error occured during buildSets');
            return buildSets(cb);
        }
        cb();
    });
};