var db = require('../db');
var async = require('async');
var queueReq = require('../operations').queueReq;
/**
 * Finds all distinct account ids in matches and requests Steam data for each
 **/
module.exports = function(cb) {
    db.matches.distinct('players.account_id', {}, function(err, array) {
        if (err) {
            return cb(err);
        }
        var filtered = [];
        async.mapSeries(array, function(id, cb) {
            var player = {
                account_id: id
            };
            db.players.find(player, function(err, docs) {
                if (!docs.length) {
                    filtered.push(player);
                }
                cb(err);
            });
        }, function(err) {
            if (err) {
                return cb(err);
            }
            array = filtered;
            var chunk = 100;
            var chunks = [];
            for (var i = 0; i < array.length; i += chunk) {
                var temp = array.slice(i, i + chunk);
                chunks.push(temp);
            }
            async.mapSeries(chunks, function(chunk, cb) {
                var summaries = {
                    summaries_id: new Date(),
                    players: chunk
                };
                queueReq("api_summaries", summaries, function(err) {
                    cb(err);
                });
            }, function(err) {
                cb(err, array.length);
            });
        });
    });
};