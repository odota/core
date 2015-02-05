var app = require('./yasp');
var async = require('async');
var moment = require('moment');
var utility = require('./utility');
var db = utility.db;
var server = app.listen(process.env.PORT || 5000, function() {
    var host = server.address().address;
    var port = server.address().port;
    console.log('[WEB] listening at http://%s:%s', host, port);
});
var io = require('socket.io')(server);
setInterval(function() {
    async.parallel({
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
            visited_last_day: function(cb) {
                db.players.count({
                    last_visited: {
                        $gt: moment().subtract(1, 'day').toDate()
                    }
                }, function(err, res) {
                    cb(err, res);
                });
            },
            tracked_players: function(cb) {
                db.players.count({
                    track: 1
                }, function(err, res) {
                    cb(err, res);
                });
            },
            untracked_players: function(cb) {
                db.players.count({
                    track: 0
                }, function(err, res) {
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
            unavailable_last_day: function(cb) {
                db.matches.count({
                    start_time: {
                        $gt: Number(moment().subtract(1, 'day').format('X'))
                    },
                    parse_status: 1
                }, function(err, res) {
                    cb(err, res);
                });
            },
            queued_matches: function(cb) {
                db.matches.count({
                    parse_status: 0
                }, function(err, res) {
                    cb(err, res);
                });
            },
            unavailable_matches: function(cb) {
                db.matches.count({
                    parse_status: 1
                }, function(err, res) {
                    cb(err, res);
                });
            },
            uploaded_matches: function(cb) {
                db.matches.count({
                    upload: true
                }, function(err, res) {
                    cb(err, res);
                });
            },
            parsed_matches: function(cb) {
                db.matches.count({
                    parse_status: 2
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
            eligible_full_history: function(cb) {
                db.players.count(utility.fullHistoryEligible(), function(err, res) {
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
        },
        function(err, results) {
            io.emit('stats', {
                stats: results,
                error: err
            });
        });
}, 1000);