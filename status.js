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
                    $ne: null
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
        queued_last_day: function(cb) {
            db.matches.count({
                start_time: {
                    $gt: Number(moment().subtract(1, 'day').format('X'))
                }
            }, function(err, docs) {
                var count = docs ? docs.filter(function(m) {
                    m.parse_status === 0;
                }) : 0;
                cb(err, count);
            });
        },
        skipped_last_day: function(cb) {
            db.matches.count({
                parse_status: 3,
                start_time: {
                    $gt: Number(moment().subtract(1, 'day').format('X'))
                }
            }, function(err, docs) {
                var count = docs ? docs.filter(function(m) {
                    m.parse_status === 3;
                }) : 0;
                cb(err, count);
            });
        },
        parsed_last_day: function(cb) {
            db.matches.count({
                parse_status: 2,
                start_time: {
                    $gt: Number(moment().subtract(1, 'day').format('X'))
                }
            }, function(err, docs) {
                var count = docs ? docs.filter(function(m) {
                    m.parse_status === 2;
                }) : 0;
                cb(err, count);
            });
        },
        unavailable_last_day: function(cb) {
            db.matches.count({
                parse_status: 1,
                start_time: {
                    $gt: Number(moment().subtract(1, 'day').format('X'))
                }
            }, function(err, docs) {
                var count = docs ? docs.filter(function(m) {
                    m.parse_status === 1
                }) : 0;
                cb(err, count);
            });
        },
        full_history: function(cb) {
            db.players.count({
                full_history_time: {
                    $ne: null
                }
            }, cb);
        },
        full_history_eligible: function(cb) {
            var base = selector("tracked");
            base.full_history_time = null;
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