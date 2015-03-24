var async = require('async');
var db = require('./db');
var redis = require('./redis').client;
var moment = require('moment');
module.exports = function getStatus(cb) {
    async.series({
        matches: function(cb) {
            db.matches.count({}, cb);
        },
        players: function(cb) {
            db.players.count({}, cb);
        },
        visited: function(cb) {
            db.players.count({
                last_visited: {
                    $ne: null
                }
            }, cb);
        },
        tracked_players: function(cb) {
            redis.get("trackedPlayers", function(err, res) {
                console.log(res);
                res = res ? Object.keys(JSON.parse(res)).length: 0;
                cb(err, res);
            });
        },
        rating_players: function(cb) {
            redis.get("ratingPlayers", function(err, res) {
                res = res ? Object.keys(JSON.parse(res)).length : 0;
                cb(err, res);
            });
        },
        matches_last_day: function(cb) {
            db.matches.count({
                start_time: {
                    $gt: Number(moment().subtract(1, 'day').format('X'))
                }
            }, cb);
        },
        queued_last_day: function(cb) {
            db.matches.count({
                parse_status: 0,
                start_time: {
                    $gt: Number(moment().subtract(1, 'day').format('X'))
                }
            }, cb);
        },
        skipped_last_day: function(cb) {
            db.matches.count({
                parse_status: 3,
                start_time: {
                    $gt: Number(moment().subtract(1, 'day').format('X'))
                }
            }, cb);
        },
        parsed_last_day: function(cb) {
            db.matches.count({
                parse_status: 2,
                start_time: {
                    $gt: Number(moment().subtract(1, 'day').format('X'))
                }
            }, cb);
        },
        unavailable_last_day: function(cb) {
            db.matches.count({
                parse_status: 1,
                start_time: {
                    $gt: Number(moment().subtract(1, 'day').format('X'))
                }
            }, cb);
        },
        full_history: function(cb) {
            db.players.count({
                full_history_time: {
                    $ne: null
                }
            }, cb);
        },
        last_added: function(cb) {
            db.matches.find({}, {
                sort: {
                    match_seq_num: -1
                },
                fields: {
                    match_id: 1,
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
                    match_seq_num: -1
                },
                fields: {
                    match_id: 1,
                    start_time: 1,
                    duration: 1
                },
                limit: 10
            }, cb);
        }
    }, cb);
};