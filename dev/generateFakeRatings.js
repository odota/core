var db = require('../db');
var async = require('async');

db.from('players').asCallback(function(err, players) {
    async.each(players, function(p, cb) {
        db.insert({
            "match_id": p.account_id,
            "account_id": p.account_id,
            "solo_competitive_rank": p.account_id % 8000,
            "competitive_rank": p.account_id % 8000,
            "time": new Date()
        }).into('player_ratings').asCallback(cb);
    }, function(err) {
        process.exit(Number(err));
    });
});