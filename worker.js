var processApi = require('./processApi');
var processFullHistory = require('./processFullHistory');
var processMmr = require('./processMmr');
var r = require('./redis');
var jobs = r.jobs;
var kue = r.kue;
var async = require('async');
var updateNames = require('./tasks/updateNames');
var buildSets = require('./tasks/buildSets');
var domain = require('domain');
//don't need these handlers when kue supports job ttl in 0.9?
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
        process.exit(err2 || err || 1);
    });
});
d.run(function() {
    console.log("[WORKER] starting worker");
    jobs.promote();
    jobs.process('api', processApi);
    jobs.process('mmr', processMmr);
    jobs.process('request', processApi);
    jobs.process('fullhistory', processFullHistory);
    //TODO currently service outages cause these reqs to stack
    setInterval(updateNames, 60 * 1000, function() {});
    setInterval(buildSets, 3 * 60 * 1000, function() {});
    //todo implement redis window check 
    //setInterval(apiStatus, 2 * 60 * 1000);
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
    /*
    function apiStatus() {
        db.matches.findOne({}, {
            fields: {
                _id: 1
            },
            sort: {
                match_seq_num: -1
            }
        }, function(err, match) {
            var elapsed = (new Date() - db.matches.id(match._id).getTimestamp());
            console.log(elapsed);
            if (elapsed > 15 * 60 * 1000) {
                redis.set("apiDown", 1);
            }
            else {
                redis.set("apiDown", 0);
            }
        });
    }
    */
