var bull = require('bull');
var config = require('./config');
var url = require('url');
var async = require('async');
var generateJob = require('./utility').generateJob;
// parse the url
var conn_info = url.parse(config.REDIS_URL, true /* parse query string */ );
if (conn_info.protocol !== 'redis:')
{
    throw new Error('connection string must use the redis: protocol');
}
var options = {
    port: conn_info.port || 6379,
    host: conn_info.hostname,
    options: conn_info.query
};
if (conn_info.auth)
{
    options.redis.auth = conn_info.auth.replace(/.*?:/, '');
}

function extractType(key)
{
    return key.split(":")[1];
}

function generateKey(type, state)
{
    return ["bull", type, state].join(":");
}

function getQueue(type)
{
    return bull(type, options.port, options.host);
}

function addToQueue(queue, payload, options, cb)
{
    var job = generateJob(queue.name, payload);
    queue.add(job,
    {
        attempts: options.attempts || 15,
        backoff:
        {
            delay: 60 * 1000,
            type: 'exponential'
        }
    }).then(function(queuejob)
    {
        console.log("created %s jobId: %s", queue.name, queuejob.jobId);
        cb(null, queuejob);
    }).catch(cb);
}

function getCounts(redis, cb)
{
    redis.keys('bull:*:id', function(err, result)
    {
        if (err)
        {
            return cb(err);
        }
        var types = result.map(function(e)
        {
            return extractType(e);
        });
        async.map(types, getQueueCounts, function(err, result)
        {
            var obj = {};
            result.forEach(function(r, i)
            {
                obj[types[i]] = r;
            });
            cb(err, obj);
        });
    });

    function getQueueCounts(type, cb)
    {
        async.series(
        {
            "wait": function(cb)
            {
                redis.llen(generateKey(type, "wait"), cb);
            },
            "act": function(cb)
            {
                redis.llen(generateKey(type, "active"), cb);
            },
            "del": function(cb)
            {
                redis.zcard(generateKey(type, "delayed"), cb);
            },
            "comp": function(cb)
            {
                redis.scard(generateKey(type, "completed"), cb);
            },
            "fail": function(cb)
            {
                redis.scard(generateKey(type, "failed"), cb);
            }
        }, cb);
    }
}

function cleanup(redis)
{
    redis.keys('bull:*:id', function(err, result)
    {
        if (err)
        {
            console.error('queue cleanup failed');
            console.error(err);
        }
        var types = result.map(function(e)
        {
            return extractType(e);
        });
        types.forEach(function(key)
        {
            this.getQueue(key).clean(24 * 60 * 60 * 1000, 'completed');
            this.getQueue(key).clean(24 * 60 * 60 * 1000, 'failed');
        });
    });
}
module.exports = {
    getQueue: getQueue,
    addToQueue: addToQueue,
    getCounts: getCounts,
    cleanup: cleanup
};