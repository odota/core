var processApi = require('./processApi');
var r = require('./redis');
var jobs = r.jobs;
var kue = r.kue;
var updateNames = require('./tasks/updateNames');
var buildSets = require('./buildSets');
var utility = require('./utility');
var invokeInterval = utility.invokeInterval;
var domain = require('domain');
var async = require('async');
var numCPUs = require('os').cpus().length;
//don't need these handlers when kue supports job ttl in 0.9?
//ttl fails jobs rather than requeuing them
jobs.watchStuckJobs();
process.on('SIGTERM', function() {
    clearActiveJobs(function(err) {
        process.exit(err || 1);
    });
});
process.on('SIGINT', function() {
    clearActiveJobs(function(err) {
        process.exit(err || 1);
    });
});
process.once('SIGUSR2', function() {
    clearActiveJobs(function(err) {
        console.log(err);
        process.kill(process.pid, 'SIGUSR2');
    });
});
var d = domain.create();
d.on('error', function(err) {
    console.log(err.stack);
    clearActiveJobs(function(err2) {
        process.exit(1);
    });
});
d.run(function() {
    console.log("[WORKER] starting worker");
    //process requests (api call, waits for parse to complete)
    jobs.process('request', numCPUs, processApi);
    invokeInterval(buildSets, 60 * 1000);
    //updatenames queues an api request
    //probably should have name updating occur in a separate service
    //jobs.process('api', processApi);
    //invokeInterval(updateNames, 60 * 1000);
    //invokeInterval(constants, 15 * 60 * 1000);
});

function clearActiveJobs(cb) {
    jobs.active(function(err, ids) {
        if (err) {
            return cb(err);
        }
        async.mapSeries(ids, function(id, cb) {
            kue.Job.get(id, function(err, job) {
                if (job) {
                    console.log("requeued job %s", id);
                    job.inactive();
                }
                cb(err);
            });
        }, function(err) {
            console.log("cleared active jobs");
            cb(err);
        });
    });
}