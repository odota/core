/**
 * Function to build status data
 **/
var config = require('../config');
var queue = require('./queue');
var async = require('async');
var moment = require('moment');
module.exports = function buildStatus(db, redis, cb)
{
    console.time('status');
    redis.zremrangebyscore("added_match", 0, moment().subtract(1, 'day').format('X'));
    redis.zremrangebyscore("error_500", 0, moment().subtract(1, 'day').format('X'));
    redis.zremrangebyscore("api_hits", 0, moment().subtract(1, 'day').format('X'));
    redis.zremrangebyscore("alias_hits", 0, moment().subtract(1, 'day').format('X'));
    redis.zremrangebyscore("parser", 0, moment().subtract(1, 'day').format('X'));
    config.RETRIEVER_HOST.split(',').map(function(r)
    {
        return "retriever:" + r.split('.')[0];
    }).forEach(function(retkey)
    {
        redis.zremrangebyscore(retkey, 0, moment().subtract(1, 'day').format('X'));
    });
    async.series(
    {
        user_players: function(cb)
        {
            /*
            db.from('players').count().whereNotNull('last_login').asCallback(function(err, count)
            {
                extractCount(err, count, cb);
            });
            */
            redis.zcard('visitors', cb);
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
            redis.zcount('visitors', moment().subtract(config.UNTRACK_DAYS, 'days').format('X'), '+inf', cb);
        },
        donated_players: function(cb)
        {
            redis.get("donators", function(err, res)
            {
                res = res ? Object.keys(JSON.parse(res)).length : 0;
                cb(err, res);
            });
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
            redis.lrange('matches_last_added', 0, -1, function(err, result)
            {
                return cb(err, result.map(function(r)
                {
                    return JSON.parse(r);
                }));
            });
        },
        last_parsed: function(cb)
        {
            redis.lrange('matches_last_parsed', 0, -1, function(err, result)
            {
                return cb(err, result.map(function(r)
                {
                    return JSON.parse(r);
                }));
            });
        },
        parser: function(cb)
        {
            async.map(["parser"], function(zset, cb)
            {
                redis.zcard(zset, function(err, cnt)
                {
                    if (err)
                    {
                        return cb(err);
                    }
                    return cb(err,
                    {
                        hostname: zset,
                        count: cnt
                    });
                });
            }, cb);
        },
        retriever: function(cb)
        {
            async.map(config.RETRIEVER_HOST.split(',').map(function(r)
            {
                return "retriever:" + r.split('.')[0];
            }), function(zset, cb)
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
                cb(err, result ||
                {});
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