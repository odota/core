var redis = require('./redis');
var queue = require('./queue');
var buildSets = require('./buildSets');
var utility = require('./utility');
var getMMStats = require("./getMMStats");
var invokeInterval = utility.invokeInterval;
var config = require('./config');
var async = require('async');
var db = require('./db');
var moment = require('moment');
console.log("[WORKER] starting worker");
invokeInterval(function doBuildSets(cb)
{
    buildSets(db, redis, cb);
}, 60 * 1000);
invokeInterval(function mmStats(cb)
{
    getMMStats(redis, cb);
}, config.MMSTATS_DATA_INTERVAL * 60 * 1000 || 60000); //Sample every 3 minutes
invokeInterval(function cleanup(cb)
{
    //clean old jobs from queue older than 1 day
    for (var key in queue)
    {
        queue[key].clean(24 * 60 * 60 * 1000, 'completed');
        queue[key].clean(24 * 60 * 60 * 1000, 'failed');
    }
    redis.zremrangebyscore("added_match", 0, moment().subtract(1, 'day').format('X'));
    redis.zremrangebyscore("error_500", 0, moment().subtract(1, 'day').format('X'));
    redis.keys("parser:*", function(err, result)
    {
        if (err)
        {
            console.log(err);
        }
        async.map(result, function(zset, cb)
        {
            redis.zremrangebyscore(zset, 0, moment().subtract(1, 'day').format('X'));
            cb();
        });
    });
    redis.keys("retriever:*", function(err, result)
    {
        if (err)
        {
            console.log(err);
        }
        async.map(result, function(zset, cb)
        {
            redis.zremrangebyscore(zset, 0, moment().subtract(1, 'day').format('X'));
            cb();
        });
    });
    return cb();
}, 60 * 60 * 1000);