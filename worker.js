var redis = require('./redis');
var queue = require('./queue');
//var updateNames = require('./tasks/updateNames');
var buildSets = require('./buildSets');
var utility = require('./utility');
var getData = utility.getData;
var getMMStats = require("./getMMStats");
var invokeInterval = utility.invokeInterval;
var config = require('./config');
var async = require('async');
var queries = require('./queries');
var db = require('./db');
var async = require('async');
var moment = require('moment');
var insertPlayer = queries.insertPlayer;
var insertMatch = queries.insertMatch;
console.log("[WORKER] starting worker");
invokeInterval(function doBuildSets(cb) {
    buildSets(db, redis, cb);
}, 60 * 1000);
invokeInterval(function mmStats(cb) {
    getMMStats(redis, cb);
}, config.MMSTATS_DATA_INTERVAL * 60 * 1000 || 60000); //Sample every 3 minutes
invokeInterval(function cleanup(cb) {
    //clean old jobs from queue older than 1 day
    for (var key in queue) {
        queue[key].clean(24 * 60 * 60 * 1000, 'completed');
        queue[key].clean(24 * 60 * 60 * 1000, 'failed');
    }
    redis.zremrangebyscore("added_match", 0, moment().subtract(1, 'day').format('X'));
    redis.zremrangebyscore("error_500", 0, moment().subtract(1, 'day').format('X'));
    redis.keys("parser:*", function(err, result) {
        if (err) {
            console.log(err);
        }
        async.map(result, function(zset, cb) {
            redis.zremrangebyscore(zset, 0, moment().subtract(1, 'day').format('X'));
            cb();
        });
    });
    redis.keys("retriever:*", function(err, result) {
        if (err) {
            console.log(err);
        }
        async.map(result, function(zset, cb) {
            redis.zremrangebyscore(zset, 0, moment().subtract(1, 'day').format('X'));
            cb();
        });
    });
    return cb();
}, 60 * 60 * 1000);
//process requests (api call, waits for parse to complete)
queue.request.process(100, processApi);
//updatenames queues an api request, probably should have name updating occur in a separate service
//invokeInterval(updateNames, 60 * 1000);
//jobs.process('api', processApi);
function processApi(job, cb) {
    var payload = job.data.payload;
    getData(job.data.url, function(err, body) {
        if (err) {
            //couldn't get data from api, non-retryable
            return cb(JSON.stringify(err));
        }
        else if (body.response) {
            //player summaries response
            async.each(body.response.players, function(player, cb) {
                insertPlayer(db, player, cb);
            }, cb);
        }
        else if (payload.match_id) {
            //match details response
            var match = body.result;
            if (job.data.request) {
                match.parse_status = 0;
            }
            insertMatch(db, redis, queue, match, {
                type: "api",
                attempts: job.data.request ? 1 : undefined
            }, function(err, job2) {
                if (err){
                    return cb(err);
                }
                //job2 is the parse job
                if (job.data.request && job2) {
                    var poll = setInterval(function() {
                        queue.parse.getJob(job2.jobId).then(function(job) {
                            job.getState().then(function(state) {
                                console.log("waiting for parse job %s, currently in %s", job.jobId, state);
                                if (state === "completed") {
                                    clearInterval(poll);
                                    return cb();
                                }
                                else if (state !== "active" && state !== "waiting") {
                                    clearInterval(poll);
                                    return cb("failed");
                                }
                            }).catch(cb);
                        }).catch(cb);
                    }, 2000);
                }
                else {
                    cb(err);
                }
            });
        }
        else {
            return cb("unknown response");
        }
    });
}
