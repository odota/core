var db = require('./db');
var async = require('async');
var redis = require('./redis').client;

function fillPlayerNames(players, cb) {
    if (!players) {
        return cb();
    }
    //make hash of account_ids to players
    //use $in query to get these players from db
    //loop through results and join with players by hash
    //iterate back through original array to get back players in order
    var player_hash = {};
    players.forEach(function(p) {
        player_hash[p.account_id] = p;
    });
    var player_ids = players.map(function(p) {
        return p.account_id;
    });
    db.players.find({
        account_id: {
            $in: player_ids
        }
    }, {
        fields: {
            "cache": 0
        }
    }, function(err, docs) {
        if (err) {
            return cb(err);
        }
        docs.forEach(function(d) {
            var player = player_hash[d.account_id];
            if (player && d) {
                for (var prop in d) {
                    player[prop] = d[prop];
                }
            }
        });
        players = players.map(function(p) {
            return player_hash[p.account_id];
        });
        cb(err);
    });
}

function getSets(cb) {
    async.parallel({
        "bots": function(cb) {
            redis.get("bots", function(err, bots) {
                bots = JSON.parse(bots || "[]");
                //sort list of bots descending, but full bots go to end
                bots.sort(function(a, b) {
                    var threshold = 100;
                    if (a.friends > threshold) {
                        return 1;
                    }
                    if (b.friends > threshold) {
                        return -1;
                    }
                    return (b.friends - a.friends);
                });
                cb(err, bots);
            });
        },
        "ratingPlayers": function(cb) {
            redis.get("ratingPlayers", function(err, rps) {
                cb(err, JSON.parse(rps || "{}"));
            });
        },
        "trackedPlayers": function(cb) {
            redis.get("trackedPlayers", function(err, tps) {
                cb(err, JSON.parse(tps || "{}"));
            });
        },
        "userPlayers": function(cb) {
            redis.get("userPlayers", function(err, ups) {
                cb(err, JSON.parse(ups || "{}"));
            });
        },
        "donators": function(cb) {
            redis.get("donators", function(err, ds) {
                cb(err, JSON.parse(ds || "{}"));
            });
        }
    }, function(err, results) {
        cb(err, results);
    });
}
module.exports = {
    getSets: getSets,
    fillPlayerNames: fillPlayerNames
};
