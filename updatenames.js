var utility = require('./utility');
var db = utility.db;
var async = require('async');
var queueReq = utility.queueReq;
module.exports = function updateNames(cb) {
    var buckets = 1;
    var target = Math.floor(Math.random() * buckets);
    db.matches.distinct('players.account_id', {
        match_id: {
            $mod: [buckets, target]
        }
    }, function(err, array) {
        if (err) {
            return cb(err);
        }
        console.log(buckets, target);
        console.log("found %s account_ids in this bucket", array.length);
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
};