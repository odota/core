var async = require('async');
var playerCache = require('./playerCache');
var countPlayerCaches = playerCache.countPlayerCaches;
var queue = require('./queue');
module.exports = function getStatus(db, redis, cb)
{
    console.time('status');
    async.series(
    {
        matches: function(cb)
        {
            //db.from('matches').count().asCallback(function(err, count) {
            db.raw("SELECT reltuples::bigint AS count FROM pg_class where relname='matches';").asCallback(function(err, count)
            {
                extractCount(err, count, cb);
            });
        },
        players: function(cb)
        {
            //db.from('players').count().asCallback(function(err, count) {
            db.raw("SELECT reltuples::bigint AS count FROM pg_class where relname='players';").asCallback(function(err, count)
            {
                extractCount(err, count, cb);
            });
        },
        user_players: function(cb)
        {
            /*
            db.from('players').count().whereNotNull('last_login').asCallback(function(err, count)
            {
                extractCount(err, count, cb);
            });
            */
            redis.get("userPlayers", function(err, res)
            {
                res = res ? Object.keys(JSON.parse(res)).length : 0;
                cb(err, res);
            });
        },
        /*
        full_history_players: function(cb)
        {
            db.from('players').count().whereNotNull('full_history_time').asCallback(function(err, count)
            {
                extractCount(err, count, cb);
            });
        },
        */
        tracked_players: function(cb)
        {
            redis.get("trackedPlayers", function(err, res)
            {
                res = res ? Object.keys(JSON.parse(res)).length : 0;
                cb(err, res);
            });
        },
        donated_players: function(cb)
        {
            redis.get("donators", function(err, res)
            {
                res = res ? Object.keys(JSON.parse(res)).length : 0;
                cb(err, res);
            });
        },
        cached_players: function(cb)
        {
            countPlayerCaches(cb);
        },
        error_500: function(cb)
        {
            redis.zcard("error_500", cb);
        },
        matches_last_day: function(cb)
        {
            redis.zcard("added_match", cb);
        },
        alias_hits: function(cb)
        {
            redis.zcard("alias_hits", cb);
        },
        api_hits: function(cb)
        {
            redis.zcard("api_hits", cb);
        },
        last_added: function(cb)
        {
            db.from('matches').select(['match_id', 'duration', 'start_time']).orderBy('match_id', 'desc').limit(10).asCallback(cb);
        },
        last_parsed: function(cb)
        {
            db.from('matches').select(['match_id', 'duration', 'start_time']).where('version', '>', 0).orderBy('match_id', 'desc').limit(10).asCallback(cb);
        },
        parser: function(cb)
        {
            redis.keys("parser:*", function(err, result)
            {
                if (err)
                {
                    return cb(err);
                }
                async.map(result, function(zset, cb)
                {
                    redis.zcard(zset, function(err, cnt)
                    {
                        if (err)
                        {
                            return cb(err);
                        }
                        return cb(err,
                        {
                            hostname: zset.substring("parser:".length),
                            count: cnt
                        });
                    });
                }, cb);
            });
        },
        retriever: function(cb)
        {
            redis.keys("retriever:*", function(err, result)
            {
                if (err)
                {
                    return cb(err);
                }
                async.map(result, function(zset, cb)
                {
                    redis.zcard(zset, function(err, cnt)
                    {
                        if (err)
                        {
                            return cb(err);
                        }
                        return cb(err,
                        {
                            hostname: zset.substring("retriever:".length),
                            count: cnt
                        });
                    });
                }, cb);
            });
        },
        queue: function(cb)
        {
            //generate object with properties as queue types, each mapped to json object mapping state to count
            queue.getCounts(redis, cb);
        },
        load_times: function(cb)
        {
            redis.lrange("load_times", 0, -1, function(err, arr)
            {
                cb(err, generateCounts(arr, 1000));
            });
        },
        parse_delay: function(cb)
        {
            redis.lrange("parse_delay", 0, -1, function(err, arr)
            {
                cb(err, generateCounts(arr, 60 * 60 * 1000));
            });
        },
        health: function(cb)
        {
            redis.hgetall('health', function(err, result)
            {
                if (err)
                {
                    return cb(err);
                }
                for (var key in result)
                {
                    result[key] = JSON.parse(result[key]);
                }
                cb(err, result || {});
            });
        }
    }, function(err, results)
    {
        cb(err, results);
    });

    function generateCounts(arr, cap)
    {
        var res = {};
        arr.forEach(function(e)
        {
            e = Math.min(e, cap);
            res[e] = res[e] ? res[e] + 1 : 1;
        });
        return res;
    }

    function extractCount(err, count, cb)
    {
        if (err)
        {
            return cb(err);
        }
        // We need the property "rows" for "matches" and "players". Others just need count
        if (count.hasOwnProperty("rows"))
        {
            count = count.rows;
        }
        //psql counts are returned as [{count:'string'}].  If we want to do math with them we need to numberify them
        cb(err, Number(count[0].count));
    }
};