var utility = require('./utility');
var config = require('./config');
var processApi = require('./processApi');
var processFullHistory = require('./processFullHistory');
var processMmr = require('./processMmr');
var getData = utility.getData;
var db = require('./db');
var r = require('./redis');
var redis = r.client;
var jobs = r.jobs;
var kue = r.kue;
var async = require('async');
var updatenames = require('./tasks/updatenames');
var selector = require('./selector');
var domain = require('domain');
var retrievers = config.RETRIEVER_HOST;
/*
//could build our own solution with socket.io?
//spin up a seaport and listen for workers to connect
//generate the list from seaport query and http request each one on build
//how do we know all the retrievers have checked in?
//we don't, but the only downside is potentially missing some mmrs for 3 minutes
var seaport = require('seaport');
var server = seaport.createServer();
server.listen(config.REGISTRY_PORT);
*/
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
    buildSets(function() {
        jobs.promote();
        jobs.process('api', processApi);
        jobs.process('mmr', processMmr);
        jobs.process('request', processApi);
        jobs.process('fullhistory', processFullHistory);
        setInterval(updatenames, 30 * 1000, function() {});
        setInterval(buildSets, 3 * 60 * 1000, function() {});
        //todo implement redis window check 
        //setInterval(apiStatus, 2 * 60 * 1000);
    });
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

function buildSets(cb) {
        console.log("rebuilding sets");
        async.series({
            "trackedPlayers": function(cb) {
                db.players.find(selector("tracked"), function(err, docs) {
                    if (err) {
                        return cb(err);
                    }
                    var t = {};
                    docs.forEach(function(player) {
                        t[player.account_id] = true;
                    });
                    //console.log(t);
                    cb(err, t);
                });
            },
            "userPlayers": function(cb) {
                db.players.find({
                    last_visited: {
                        $ne: null
                    }
                }, function(err, docs) {
                    if (err) {
                        return cb(err);
                    }
                    var t = {};
                    docs.forEach(function(player) {
                        t[player.account_id] = true;
                    });
                    //console.log(t);
                    cb(err, t);
                });
            },
            /*
            "parsers": function(cb) {
                var parsers = [];
                var ps = config.PARSER_HOST.split(",").map(function(p) {
                    return "http://" + p + "?key=" + config.RETRIEVER_SECRET;
                });
                //build array from PARSER_HOST based on each worker's core count
                async.each(ps, function(url, cb) {
                    getData(url, function(err, body) {
                        if (err) {
                            return cb(err);
                        }
                        for (var i = 0; i < body.capacity; i++) {
                            parsers.push(url);
                        }
                        cb(err);
                    });
                }, function(err) {
                    cb(err, parsers);
                });
            },
            */
            "retrievers": function(cb) {
                var r = {};
                var b = [];
                var ps = retrievers.split(",").map(function(r) {
                    return "http://" + r + "?key=" + config.RETRIEVER_SECRET;
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
                    var result = {
                        ratingPlayers: r,
                        bots: b,
                        retrievers: ps
                    };
                    cb(err, result);
                });
            }
        }, function(err, result) {
            if (err) {
                return buildSets(cb);
            }
            //separate out retriever data into separate keys
            result.ratingPlayers = result.retrievers.ratingPlayers;
            result.bots = result.retrievers.bots;
            result.retrievers = result.retrievers.retrievers;
            for (var key in result) {
                redis.set(key, JSON.stringify(result[key]));
            }
            cb();
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
