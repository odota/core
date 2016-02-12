var db = require('../db');
var async = require('async');
var queue = require('../queue');
var fhQueue = queue.getQueue('fullhistory');
var queueReq = require('../utility').queueReq;
/**
 * Get all players who have visited and don't have full history, and queue for full history
 **/
module.exports = function fullhistory(cb) {
    db.from('players').whereNotNull('last_login').whereNull('full_history_time').asCallback(function(err, players) {
        if (err) {
            return cb(err);
        }
        async.eachSeries(players, function(player, cb) {
            queue.addToQueue(fhQueue, player, {
                attempts: 1
            }, function(err, job) {
                cb(err);
            });
        }, function(err) {
            cb(err);
        });
    });
};
