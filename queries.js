var db = require('./db');
var async = require('async');
var redis = require('./redis').client;

function fillPlayerNames(players, cb) {
    async.mapSeries(players, function (player, cb) {
        db.players.findOne({
            account_id: player.account_id
        }, function (err, dbPlayer) {
            if (dbPlayer) {
                for (var prop in dbPlayer) {
                    player[prop] = dbPlayer[prop];
                }
            }
            cb(err);
        });
    }, function (err) {
        cb(err);
    });
}

function getRatingData(req, cb) {
    if (!req.user) {
        return cb(null);
    }
    var account_id = req.user.account_id;
    async.series({
        "bots": function (cb) {
            redis.get("bots", function (err, bots) {
                bots = JSON.parse(bots || "[]");
                //sort list of bots descending, but full bots go to end
                if (bots.constructor === Array) {
                    bots.sort(function (a, b) {
                        var threshold = 100;
                        if (a.friends > threshold) {
                            return 1;
                        }
                        if (b.friends > threshold) {
                            return -1;
                        }
                        return (b.friends - a.friends);
                    });
                }
                cb(err, bots);
            });
        },
        "ratingPlayers": function (cb) {
            redis.get("ratingPlayers", function (err, rps) {
                cb(err, JSON.parse(rps || "{}"));
            });
        },
        "trackedPlayers": function (cb) {
            redis.get("trackedPlayers", function (err, tps) {
                cb(err, JSON.parse(tps || "{}"));
            });
        },
        "ratings": function (cb) {
            db.ratings.find({
                    account_id: account_id
                },
                function (err, docs) {
                    cb(err, docs);
                });
        }
    }, function (err, results) {
        cb(err, results);
    });
}

module.exports = {
    fillPlayerNames: fillPlayerNames,
    getRatingData: getRatingData
};