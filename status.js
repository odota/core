var async = require('async');
module.exports = function getStatus(db, r, cb) {
    var redis = r.client;
    var queue = r.queue;
    console.time('status');
    async.series({
        matches: function(cb) {
            db.matches.count({}, cb);
        },
        players: function(cb) {
            db.players.count({}, cb);
        },
        user_players: function(cb) {
            db.players.count({
                last_visited: {
                    $gt: new Date(0)
                }
            }, cb);
        },
        full_history_players: function(cb) {
            db.players.count({
                full_history_time: {
                    $gt: new Date(0)
                }
            }, cb);
        },
        tracked_players: function(cb) {
            redis.get("trackedPlayers", function(err, res) {
                res = res ? Object.keys(JSON.parse(res)).length : 0;
                cb(err, res);
            });
        },
        rating_players: function(cb) {
            redis.get("ratingPlayers", function(err, res) {
                res = res ? Object.keys(JSON.parse(res)).length : 0;
                cb(err, res);
            });
        },
        donated_players: function(cb) {
            redis.get("donators", function(err, res) {
                res = res ? Object.keys(JSON.parse(res)).length : 0;
                cb(err, res);
            });
        },
        cached_players: function(cb) {
            redis.keys("player:*", function(err, result) {
                cb(err, result.length);
            });
        },
        matches_last_day: function(cb) {
            redis.keys("added_match:*", function(err, result) {
                cb(err, result.length);
            });
        },
        parsed_last_day: function(cb) {
            redis.keys("parsed_match:*", function(err, result) {
                cb(err, result.length);
            });
        },
        requested_last_day: function(cb) {
            redis.keys("requested_match:*", function(err, result) {
                cb(err, result.length);
            });
        },
        last_added: function(cb) {
            db.matches.find({}, {
                sort: {
                    _id: -1
                },
                fields: {
                    match_id: 1,
                    match_seq_num: 1,
                    start_time: 1,
                    duration: 1
                },
                limit: 10
            }, cb);
        },
        last_parsed: function(cb) {
            db.matches.find({
                parse_status: 2
            }, {
                sort: {
                    _id: -1
                },
                fields: {
                    match_id: 1,
                    match_seq_num: 1,
                    start_time: 1,
                    duration: 1
                },
                limit: 10
            }, cb);
        },
        kue: function(cb) {
            var counts = {};
            queue.types(function(err, data) {
                if (err) {
                    return cb(err);
                }
                async.each(data, function(d, cb) {
                    // others are activeCount, completeCount, failedCount, delayedCount
                    queue.inactiveCount(d, function(err, result) {
                        counts[d] = result;
                        cb(err);
                    });
                }, function(err) {
                    cb(err, counts);
                });
            });
        }
    }, function(err, results) {
        console.timeEnd('status');
        cb(err, results);
    });
};