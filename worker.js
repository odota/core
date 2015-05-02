var processApi = require('./processApi');
var processFullHistory = require('./processFullHistory');
var processMmr = require('./processMmr');
var r = require('./redis');
var jobs = r.jobs;
var kue = r.kue;
var redis = r.client;
var utility = require('./utility');
var getData = utility.getData;
var async = require('async');
var updateNames = require('./tasks/updateNames');
var buildSets = require('./tasks/buildSets');
var constants = require('./tasks/constants');
var domain = require('domain');
var config = require('./config');
var retrievers = config.RETRIEVER_HOST;
var parsers = config.PARSER_HOST;
var secret = config.RETRIEVER_SECRET;
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
    invokeInterval(updateNames, 60 * 1000);
    invokeInterval(buildSets, 3 * 60 * 1000);
    invokeInterval(getRetrievers, 3 * 60 * 1000);
    invokeInterval(getParsers, 3 * 60 * 1000);
    //invokeInterval(constants, 15 * 60 * 1000);
});

function invokeInterval(func, delay) {
    //invokes the function immediately, waits for callback, waits the delay, and then calls it again
    (function foo() {
        func(function() {
            setTimeout(foo, delay);
        });
    })();
}

function getRetrievers(cb) {
    var r = {};
    var b = [];
    var ps = retrievers.split(",").map(function(r) {
        return "http://" + r + "?key=" + secret;
    });
    async.each(ps, function(url, cb) {
        getData(url, function(err, body) {
            if (err) {
                return cb(err);
            }
            for (var key in body.accounts) {
                b.push(body.accounts[key]);
            }
            for (var key in body.accountToIdx) {
                r[key] = url + "&account_id=" + key;
            }
            cb(err);
        });
    }, function(err) {
        redis.set("ratingPlayers", JSON.stringify(r));
        redis.set("bots", JSON.stringify(b));
        redis.set("retrievers", JSON.stringify(ps));
        cb(err);
    });
}

function getParsers(cb) {
    var parser_urls = [];
    var ps = parsers.split(",").map(function(p) {
        return "http://" + p + "?key=" + secret;
    });
    //build array from PARSER_HOST based on each worker's core count
    async.each(ps, function(url, cb) {
        getData(url, function(err, body) {
            if (err) {
                return cb(err);
            }
            for (var i = 0; i < body.capacity; i++) {
                parser_urls.push(url);
            }
            cb(err);
        });
    }, function(err) {
        redis.set("parsers", JSON.stringify(parser_urls));
        cb(err, parser_urls);
    });
}

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
        //TODO implement better service outage check
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
