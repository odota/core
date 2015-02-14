var async = require('async');
var db = require('./db');
var moment = require('moment');
var selector = require('./selector');
module.exports = function getStatus(cb) {
    async.series({
            matches: function(cb) {
                db.matches.count({}, function(err, res) {
                    cb(err, res);
                });
            },
            players: function(cb) {
                db.players.count({}, function(err, res) {
                    cb(err, res);
                });
            },
            visited: function(cb) {
                db.players.count({
                    last_visited: {
                        $exists: true
                    }
                }, function(err, res) {
                    cb(err, res);
                });
            },
            tracked_players: function(cb) {
                db.players.count(selector("tracked"), function(err, res) {
                    cb(err, res);
                });
            },
            matches_last_day: function(cb) {
                db.matches.count({
                    start_time: {
                        $gt: Number(moment().subtract(1, 'day').format('X'))
                    }
                }, function(err, res) {
                    cb(err, res);
                });
            },
            parsed_matches_last_day: function(cb) {
                db.matches.count({
                    parse_status: 2,
                    start_time: {
                        $gt: Number(moment().subtract(1, 'day').format('X'))
                    }
                }, function(err, res) {
                    cb(err, res);
                });
            },
            unavailable_last_day: function(cb) {
                db.matches.count({
                    parse_status: 1,
                    start_time: {
                        $gt: Number(moment().subtract(1, 'day').format('X'))
                    }
                }, function(err, res) {
                    cb(err, res);
                });
            },
            eligible_full_history: function(cb) {
                db.players.count(selector("fullhistory"), function(err, res) {
                    cb(err, res);
                });
            },
            obtained_full_history: function(cb) {
                db.players.count({
                    full_history_time: {
                        $exists: true
                    }
                }, function(err, res) {
                    cb(err, res);
                });
            },
            //todo ratingbot
            //todo kue state
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
                    limit: 5
                }, function(err, matches) {
                    cb(err, matches);
                });
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
                    limit: 5
                }, function(err, matches) {
                    cb(err, matches);
                });
            }
        },
        function(err, result) {
            cb(err, result);
        });
};