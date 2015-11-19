var async = require('async');
var moment = require('moment');
module.exports = function getStatus(db, redis, queue, cb) {
    console.time('status');
    async.series({
        matches: function(cb) {
            //db.from('matches').count().asCallback(function(err, count) {
            db.raw("SELECT reltuples::bigint AS count FROM pg_class where relname='matches';").asCallback(function(err, count) {
                extractCount(err, count, cb);
            });
        },
        players: function(cb) {
            //db.from('players').count().asCallback(function(err, count) {
            db.raw("SELECT reltuples::bigint AS count FROM pg_class where relname='players';").asCallback(function(err, count) {
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
            redis.zremrangebyscore("added_match", 0, moment().subtract(1, 'day').format('X'), function(err) {
                if (err) {
                    return cb(err);
                }
                redis.zcard("added_match", cb);
            });
            /*
            redis.keys("added_match:*", function(err, result) {
                cb(err, result.length);
            });
            */
        },
        last_added: function(cb) {
            db.from('matches').select(['match_id', 'duration', 'start_time']).orderBy('match_id', 'desc').limit(10).asCallback(cb);
        },
        last_parsed: function(cb) {
            db.from('matches').select(['match_id', 'duration', 'start_time']).where('version', '>', 0).orderBy('match_id', 'desc').limit(10).asCallback(cb);
        },
        cluster: function(cb) {
            redis.keys("parse:*", function(err, result) {
                if (err) {
                    return cb(err);
                }
                async.map(result, function(zset, cb) {
                    redis.zremrangebyscore(zset, 0, moment().subtract(1, 'day').format('X'), function(err) {
                        if (err) {
                            return cb(err);
                        }
                        redis.zcard(zset, function(err, cnt) {
                            if (err) {
                                return cb(err);
                            }
                            return cb(err, {
                                hostname: zset.substring("parse:".length),
                                count: cnt
                            });
                        });
                    });
                }, cb);
            });
        },
        queue: function(cb) {
            console.time('queue');
            //object with properties as queue types, each mapped to json object mapping state to count
            async.map(Object.keys(queue), getQueueCounts, function(err, result) {
                var obj = {};
                result.forEach(function(r, i) {
                    obj[Object.keys(queue)[i]] = r;
                });
                console.timeEnd('queue');
                cb(err, obj);
            });

            function getQueueCounts(type, cb) {
                async.series({
                    "wait": function(cb) {
                        redis.llen(queue[type].toKey("wait"), cb);
                    },
                    "act": function(cb) {
                        redis.llen(queue[type].toKey("active"), cb);
                    },
                    "del": function(cb) {
                        redis.zcard(queue[type].toKey("delayed"), cb);
                    },
                    "comp": function(cb) {
                        redis.scard(queue[type].toKey("completed"), cb);
                    },
                    "fail": function(cb) {
                        redis.scard(queue[type].toKey("failed"), cb);
                    }
                }, cb);
            }
        }
    }, function(err, results) {
        console.timeEnd('status');
        cb(err, results);
    });

    function extractCount(err, count, cb) {
        if (err) {
            return cb(err);
        }
        // We need the property "rows" for "matches" and "players". Others just need count
        if (count.hasOwnProperty("rows")) {
            count = count.rows;
        }
        //psql counts are returned as [{count:'string'}].  If we want to do math with them we need to numberify them
        cb(err, Number(count[0].count));
    }
};