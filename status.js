var async = require('async');
var db = require('./db');
var moment = require('moment');
var selector = require('./selector');
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
                    $exists: true
                }
            }, cb);
        },
        tracked_players: function(cb) {
            db.players.count(selector("tracked"), cb);
        },
        matches_last_day: function(cb) {
            db.matches.count({
                start_time: {
                    $gt: Number(moment().subtract(1, 'day').format('X'))
                }
            }, cb);
        },
        parsed_matches_last_day: function(cb) {
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
                    $exists: true
                }
            }, cb);
        },
        full_history_eligible: function(cb) {
            var base = selector("tracked");
            base.full_history_time = {
                $exists: false
            };
            db.players.count(base, cb);
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