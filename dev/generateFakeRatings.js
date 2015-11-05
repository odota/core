var db = require('../db');
var async = require('async');
db.from('players').asCallback(function(err, players) {
    async.each(players, function(p, cb) {
        var fake = {
            "match_id": p.account_id,
            "account_id": p.account_id,
            "solo_competitive_rank": ~~gaussianRandom(4000, 1000),
            "competitive_rank": p.account_id % 8000,
            "time": new Date()
        };
        console.log(fake.account_id, fake.solo_competitive_rank);
        db.insert(fake).into('player_ratings').asCallback(cb);
    }, function(err) {
        process.exit(Number(err));
    });
});

function gaussianRandom(mean, std) {
    if (mean === undefined || std === undefined) {
        throw "Gaussian random needs 2 arguments (mean, standard deviation)";
    }
    return randByCentralLimitTheorem() * std + mean;
}

function randByCentralLimitTheorem() {
    var v = 0;
    for (var i = 0; i < 12; i++) {
        v += Math.random();
    }
    return v - 6;
}