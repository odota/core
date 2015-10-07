var async = require('async');
module.exports = function getStatus(db, redis, queue, cb) {
    console.time('status');
    async.series({
        matches: function(cb) {
            db.from('matches').count().asCallback(function(err, count) {
                extractCount(err, count, cb);
            });
        },
        players: function(cb) {
            db.from('players').count().asCallback(function(err, count) {
                extractCount(err, count, cb);
            });
        },
        user_players: function(cb) {
            db.from('players').count().whereNotNull('last_login').asCallback(function(err, count) {
                extractCount(err, count, cb);
            });
        },
        full_history_players: function(cb) {
            db.from('players').count().whereNotNull('full_history_time').asCallback(function(err, count) {
                extractCount(err, count, cb);
            });
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
        /*
        parsed_last_day: function(cb) {
            redis.keys("parsed_match:*", function(err, result) {
                cb(err, result.length);
            });
        },
        */
        /*
        requested_last_day: function(cb) {
            redis.keys("requested_match:*", function(err, result) {
                cb(err, result.length);
            });
        },
        */
        last_added: function(cb) {
            db.from('matches').orderBy('match_id', 'desc').limit(10).asCallback(cb);
        },
        last_parsed: function(cb) {
            db.from('matches').where('version', '>', 0).orderBy('match_id', 'desc').limit(10).asCallback(cb);
        },
        queue: function(cb) {
            //object with properties as queue types, each mapped to json object mapping state to count
            async.mapSeries(Object.keys(queue), getQueueCounts, function(err, result){
                var obj = {};
                result.forEach(function(r, i){
                    obj[Object.keys(queue)[i]] = r;
                });
                cb(err, obj);
            });
            function getQueueCounts(type, cb) {
                async.series({
                    "waiting": function(cb) {
                        queue[type].getWaiting().then(function(count) {
                            cb(null, count.length);
                        });
                    },
                    "active": function(cb) {
                        queue[type].getActive().then(function(count) {
                            cb(null, count.length);
                        });
                    },
                    "delayed": function(cb) {
                        queue[type].getDelayed().then(function(count) {
                            cb(null, count.length);
                        });
                    },
                    "completed": function(cb) {
                        queue[type].getCompleted().then(function(count) {
                            cb(null, count.length);
                        });
                    },
                    "failed": function(cb) {
                        queue[type].getFailed().then(function(count) {
                            cb(null, count.length);
                        });
                    }
                }, cb);
            }
        },
        parser_status: function(cb) {
            redis.get("parsers-status", cb);
        }
    }, function(err, results) {
        console.timeEnd('status');
        cb(err, results);
    });

    function extractCount(err, count, cb) {
        if (err) {
            return cb(err);
        }
        //psql counts are returned as [{count:'string'}].  If we want to do math with them we need to numberify them
        cb(err, Number(count[0].count));
    }
};