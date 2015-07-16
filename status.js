var async = require('async');
var db = require('./db');
var r = require('./redis');
var redis = r.client;
var moment = require('moment');
var kue = r.kue;
var jobs = r.jobs;
module.exports = function getStatus(cb) {
    async.parallel({
        matches: function(cb) {
            db.matches.count({}, cb);
        },
        players: function(cb) {
            db.players.count({}, cb);
        },
        yasp_players: function(cb) {
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
            jobs.types(function(err, data) {
                async.each(data, function(d, cb) {
                    jobs.cardByType(d, "inactive", function(err, result) {
                        counts[d] = result;
                        cb(err);
                    });
                }, function(err) {
                    cb(err, counts);
                });
            });
        }
    }, cb);
};