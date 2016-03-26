var redis = require('./redis');
var queue = require('./queue');
var buildSets = require('./buildSets');
var utility = require('./utility');
var getMMStats = require("./getMMStats");
var config = require('./config');
var async = require('async');
var db = require('./db');
var moment = require('moment');
var fs = require('fs');
var constants = require('./constants');
var sql = {};
var sqlq = fs.readdirSync('./sql');
var queries = require('./queries');
sqlq.forEach(function(f)
{
    sql[f.split('.')[0]] = fs.readFileSync('./sql/' + f, 'utf8');
});
console.log("[WORKER] starting worker");
invokeInterval(function doBuildSets(cb)
{
    buildSets(db, redis, cb);
}, 60 * 1000);
invokeInterval(function mmStats(cb)
{
    getMMStats(redis, cb);
}, config.MMSTATS_DATA_INTERVAL * 60 * 1000); //Sample every 3 minutes
invokeInterval(function buildDistributions(cb)
{
    async.parallel(
    {
        "game_mode": function(cb)
        {
            var mapFunc = function(results)
            {
                results.rows = results.rows.map(function(r)
                {
                    r.display_name = constants.game_mode[r.game_mode] ? constants.game_mode[r.game_mode].name : r.game_mode;
                    return r;
                });
            }
            loadData("game_mode", mapFunc, cb);
        },
        "lobby_type": function(cb)
        {
            var mapFunc = function(results)
            {
                results.rows = results.rows.map(function(r)
                {
                    r.display_name = constants.lobby_type[r.lobby_type] ? constants.lobby_type[r.lobby_type].name : r.lobby_type;
                    return r;
                });
            }
            loadData("lobby_type", mapFunc, cb);
        },
        "skill": function(cb)
        {
            var mapFunc = function(results)
            {
                results.rows = results.rows.map(function(r)
                {
                    r.display_name = constants.skill[r.skill] || "Unknown";
                    return r;
                });
            }
            loadData("skill", mapFunc, cb);
        },
        "country_mmr": function(cb)
        {
            var mapFunc = function(results)
            {
                results.rows = results.rows.map(function(r)
                {
                    var ref = constants.countries[r.loccountrycode];
                    r.common = ref ? ref.name.common : r.loccountrycode;
                    return r;
                });
            }
            loadData("country_mmr", mapFunc, cb);
        },
        "mmr": function(cb)
        {
            var mapFunc = function(results)
            {
                var sum = results.rows.reduce(function(prev, current)
                {
                    return {
                        count: prev.count + current.count
                    };
                },
                {
                    count: 0
                });
                results.rows = results.rows.map(function(r, i)
                {
                    r.cumulative_sum = results.rows.slice(0, i + 1).reduce(function(prev, current)
                    {
                        return {
                            count: prev.count + current.count
                        };
                    },
                    {
                        count: 0
                    }).count;
                    return r;
                });
                results.sum = sum;
            }
            loadData("mmr", mapFunc, cb);
        }
    }, function(err, result)
    {
        if (err)
        {
            return cb(err);
        }
        for (var key in result)
        {
            redis.set('distribution:' + key, JSON.stringify(result[key]));
        }
        cb(err);
    });

    function loadData(key, mapFunc, cb)
    {
        db.raw(sql[key]).asCallback(function(err, results)
        {
            if (err)
            {
                return cb(err);
            }
            mapFunc(results);
            return cb(err, results);
        });
    }
}, 60 * 60 * 1000 * 6);
invokeInterval(function cleanup(cb)
{
    redis.zremrangebyscore("added_match", 0, moment().subtract(1, 'day').format('X'));
    redis.zremrangebyscore("error_500", 0, moment().subtract(1, 'day').format('X'));
    redis.zremrangebyscore("api_hits", 0, moment().subtract(1, 'day').format('X'));
    redis.zremrangebyscore("alias_hits", 0, moment().subtract(1, 'day').format('X'));
    var cleans = ["parser", "retriever"];
    async.parallel(
    {
        "counts": function(cb)
        {
            async.each(cleans, function(key, cb)
            {
                redis.keys(key + ":*", function(err, result)
                {
                    if (err)
                    {
                        return cb(err);
                    }
                    result.forEach(function(zset)
                    {
                        redis.zremrangebyscore(zset, 0, moment().subtract(1, 'day').format('X'));
                    });
                    cb(err);
                });
            }, cb);
        },
        "picks": function(cb)
        {
            redis.get('picks_match_count', function(err, count)
            {
                if (err)
                {
                    return cb(err);
                }
                count = Number(count);
                if (count > 10000000)
                {
                    redis.keys('picks_*', function(err, keys)
                    {
                        if (err)
                        {
                            return cb(err);
                        }
                        keys.forEach(function(k)
                        {
                            redis.del(k);
                        });
                        cb(err);
                    });
                }
                else
                {
                    cb(err);
                }
            });
        }
    }, cb);
}, 60 * 60 * 1000);
invokeInterval(function cleanBenchmarks(cb)
{
    //clean up old benchmarks
    redis.keys("benchmarks:*", function(err, result)
    {
        if (err)
        {
            return cb(err);
        }
        result.forEach(function(k)
        {
            if (Number(k.split(':')[1]) < Number(utility.getStartOfBlockHours(config.BENCHMARK_RETENTION_HOURS, -1)))
            {
                redis.del(k);
            }
        });
        cb(err);
    });
}, 60 * 60 * 1000);
invokeInterval(function cleanMatchRatings(cb)
{
    redis.keys("match_ratings:*", function(err, result)
    {
        if (err)
        {
            return cb(err);
        }
        result.forEach(function(k)
        {
            if (Number(k.split(':')[1]) < Number(utility.getStartOfBlockHours(24, -1)))
            {
                redis.del(k);
            }
        });
        cb(err);
    });
}, 60 * 60 * 1000);
invokeInterval(function cleanQueues(cb)
{
    queue.cleanup(redis, cb);
}, 60 * 60 * 1000);
invokeInterval(function notablePlayers(cb)
{
    var container = utility.generateJob("api_notable",
    {});
    utility.getData(container.url, function(err, body)
    {
        if (err)
        {
            return cb(err);
        }
        async.each(body.player_infos, function(p, cb)
        {
            queries.upsert(db, 'notable_players', p,
            {
                account_id: p.account_id
            }, cb);
        }, cb);
    });
}, 10 * 60 * 1000);
/*
invokeInterval(function loadPickCounts(cb)
{
    var keys = ['picks', 'picks_wins'];
    async.each(keys, function(base, cb)
    {
        //load counts into zset
        redis.keys(base + ':*', function(err, result)
        {
            if (err)
            {
                return cb(err);
            }
            async.eachSeries(result, function(key, cb)
            {
                redis.zcard(key, function(err, card)
                {
                    if (err)
                    {
                        return cb(err);
                    }
                    var spl = key.split(':');
                    var length = spl[1];
                    var pick = spl[2];
                    redis.zadd(base + '_counts:' + length, card, pick);
                    cb(err);
                });
            });
        });
    }, cb);
}, 60 * 60 * 1000);
*/
function invokeInterval(func, delay)
{
    //invokes the function immediately, waits for callback, waits the delay, and then calls it again
    (function invoker()
    {
        redis.get('worker:' + func.name, function(err, fresh)
        {
            if (err)
            {
                return setTimeout(invoker, delay);
            }
            if (fresh && config.NODE_ENV !== "development")
            {
                console.log("skipping %s", func.name);
                return setTimeout(invoker, delay);
            }
            else
            {
                console.log("running %s", func.name);
                console.time(func.name);
                func(function(err)
                {
                    if (err)
                    {
                        //log the error, but wait until next interval to retry
                        console.error(err);
                    }
                    else
                    {
                        //mark success, don't redo until this key expires
                        redis.setex('worker:' + func.name, delay / 1000 * 0.9, "1");
                    }
                    console.timeEnd(func.name);
                    setTimeout(invoker, delay);
                });
            }
        });
    })();
}
