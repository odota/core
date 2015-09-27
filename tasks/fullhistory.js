var db = require('../db');
var async = require('async');
var queue = require('../redis').jobs;
var queueReq = require('../utility').queueReq;
/**
 * Get all players who have visited and don't have full history, and queue for full history
 **/
module.exports = function fullhistory(cb) {
    //TODO rewrite this
    db.players.find({
        last_visited: {
            $ne: null
        },
        full_history_time: null
    }, function(err, players) {
        if (err) {
            return cb(err);
        }
        async.eachSeries(players, function(player, cb) {
            player.priority = "low";
            queueReq(queue, "fullhistory", player, function(err, job) {
                cb(err);
            });
        }, function(err) {
            cb(err);
        });
    });
};