/**
 * Provides methods for working with the job queue
 **/
var generateJob = require('../util/utility').generateJob;
var config = require('../config');
var bull = require('bull');
var url = require('url');
var async = require('async');
var types = ["request", "mmr", "parse", "cache", "fullhistory"];
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
    options.attempts = options.attempts || 15;
    options.backoff = options.backoff ||
    {
        delay: 60 * 1000,
        type: 'exponential'
    };
    queue.add(job, options).then(function(queuejob)
    {
        //console.log("created %s jobId: %s", queue.name, queuejob.jobId);
        cb(null, queuejob);
    }).catch(cb);
}

function getCounts(redis, cb)
{
    async.map(types, getQueueCounts, function(err, result)
    {
        var obj = {};
        result.forEach(function(r, i)
        {
            obj[types[i]] = r;
        });
        cb(err, obj);
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

function cleanup(redis, cb)
{
    async.each(types, function(key, cb)
    {
        var queue = getQueue(key);
        async.each(['active', 'completed', 'failed', 'delayed'], function(type, cb)
        {
            queue.clean(24 * 60 * 60 * 1000, type);
            queue.once('cleaned', function(job, type)
            {
                console.log('cleaned %s %s jobs from queue %s', job.length, type, key);
                cb();
            });
        }, cb);
    }, cb);
}
module.exports = {
    getQueue: getQueue,
    addToQueue: addToQueue,
    getCounts: getCounts,
    cleanup: cleanup
};
