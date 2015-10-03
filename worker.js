var redis = require('./redis');
var queue = require('./queue');
//var updateNames = require('./tasks/updateNames');
var buildSets = require('./buildSets');
var utility = require('./utility');
var getData = utility.getData;
var serviceDiscovery = require('./serviceDiscovery');
var getMMStats = require("./getMMStats");
var invokeInterval = utility.invokeInterval;
var numCPUs = require('os').cpus().length;
var config = require('./config');
var async = require('async');
var queries = require('./queries');
var insertPlayer = queries.insertPlayer;
var db = require('./db');
var async = require('async');
var insertPlayer = queries.insertPlayer;
var insertMatch = queries.insertMatch;
var insertMatchProgress = queries.insertMatchProgress;
console.log("[WORKER] starting worker");
invokeInterval(function(cb) {
    buildSets(db, redis, cb);
}, 60 * 1000);
invokeInterval(function(cb) {
    serviceDiscovery.queryRetrievers(redis, cb);
}, 60 * 1000);
invokeInterval(function(cb) {
    getMMStats(redis, cb);
}, config.MMSTATS_DATA_INTERVAL * 60 * 1000 || 60000); //Sample every 3 minutes
queue.watchStuckJobs();
//process requests (api call, waits for parse to complete)
queue.process('request', numCPUs, processApi);
utility.cleanup(queue, 'request');
//updatenames queues an api request, probably should have name updating occur in a separate service
//jobs.process('api', processApi);
//invokeInterval(updateNames, 60 * 1000);
//invokeInterval(constants, 15 * 60 * 1000);
function processApi(job, cb) {
    var payload = job.data.payload;
    job.progress(0, 100, "Getting basic match data from Steam API...");
    getData(job.data.url, function(err, body) {
        if (err) {
            //couldn't get data from api, non-retryable
            return cb(JSON.stringify(err));
        }
        else if (body.response) {
            async.each(body.response.players, function(player, cb) {
                insertPlayer(db, player, cb);
            }, cb);
        }
        else if (payload.match_id) {
            var match = body.result;
            job.progress(0, 100, "Received basic match data.");
            //we want to try to parse this match
            match.parse_status = 0;
            var insertFunc = payload.request ? insertMatchProgress : insertMatch;
            insertFunc(db, redis, queue, match, {
                type: "api",
                job: job
            }, cb);
        }
        else {
            return cb("unknown response");
        }
    });
}
