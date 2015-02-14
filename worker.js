var utility = require('./utility');
var processors = require('./processors');
var getData = utility.getData;
var db = require('./db');
var r = require('./redis');
var redis = r.client;
var jobs = r.jobs;
var kue = r.kue;
var logger = utility.logger;
var generateJob = utility.generateJob;
var async = require('async');
var operations = require('./operations');
var insertMatch = operations.insertMatch;
var queueReq = operations.queueReq;
var fullhistory = require('./tasks/fullhistory');
var updatenames = require('./tasks/updatenames');
var selector = require('./selector');
var getmissing = require('./tasks/getmissing');
var domain = require('domain');

var trackedPlayers = {};
var ratingPlayers = {};

var d = domain.create();
d.on('error', function() {
    clearActiveJobs(function(err) {
        process.exit(err);
    });
});
d.run(function() {
    console.log("[WORKER] starting worker");
    build(function() {
        startScan();
        jobs.promote();
        jobs.process('api', processors.processApi);
        jobs.process('mmr', processors.processMmr);
        setInterval(fullhistory, 60 * 60 * 1000, function() {});
        setInterval(updatenames, 5 * 60 * 1000, function() {});
        setInterval(getmissing, 10 * 60 * 1000, function() {});
        setInterval(build, 5 * 60 * 1000, function() {});
    });
});

function build(cb) {
    console.log("rebuilding sets");
    db.players.find(selector("tracked"), function(err, docs) {
        if (err) {
            return build(cb);
        }
        var t = {};
        var r = {};
        var b = [];
        docs.forEach(function(player) {
            t[player.account_id] = true;
        });
        async.map(utility.getRetrieverUrls(), function(url, cb) {
            getData(url, function(err, body) {
                for (var key in body.accounts) {
                    b.push(body.accounts[key]);
                }
                for (var key in body.accountToIdx) {
                    r[key] = url + "?account_id=" + key;
                }
                cb(err);
            });
        }, function(err) {
            if (err) {
                return build(cb);
            }
            trackedPlayers = t;
            ratingPlayers = r;
            redis.set("bots", JSON.stringify(b));
            redis.set("ratingPlayers", JSON.stringify(r));
            redis.set("trackedPlayers", JSON.stringify(t));
            return cb(err);
        });
    });
}

function startScan() {
    if (process.env.START_SEQ_NUM === "AUTO") {
        var container = generateJob("api_history", {});
        getData(container.url, function(err, data) {
            if (err) {
                return startScan();
            }
            scanApi(data.result.matches[0].match_seq_num);
        });
    }
    else if (process.env.START_SEQ_NUM) {
        scanApi(process.env.START_SEQ_NUM);
    }
    else {
        redis.get("match_seq_num", function(err, result) {
            if (!err && result) {
                scanApi(result);
            }
            else {
                return startScan();
            }
        });
    }
}

function clearActiveJobs(cb) {
    jobs.active(function(err, ids) {
        if (err) {
            return cb(err);
        }
        async.mapSeries(ids, function(id, cb) {
            kue.Job.get(id, function(err, job) {
                if (err) {
                    return cb(err);
                }
                if ((new Date() - job.updated_at) > 5 * 60 * 1000) {
                    console.log("unstuck job %s", id);
                    job.inactive();
                }
                cb(err);
            });
        }, function(err) {
            cb(err);
        });
    });
}

function scanApi(seq_num) {
    var container = generateJob("api_sequence", {
        start_at_match_seq_num: seq_num
    });
    getData(container.url, function(err, data) {
        if (err) {
            return scanApi(seq_num);
        }
        var resp = data.result.matches;
        logger.info("[API] seq_num: %s, found %s matches", seq_num, resp.length);
        async.mapSeries(resp, function(match, cb) {
            var tracked = false;
            async.map(match.players, function(p, cb) {
                if (p.account_id in trackedPlayers) {
                    tracked = true;
                }
                if (p.account_id in ratingPlayers && match.lobby_type === 7) {
                    queueReq("mmr", {
                        match_id: match.match_id,
                        account_id: p.account_id,
                        url: ratingPlayers[p.account_id]
                    }, function(err) {
                        cb(err);
                    });
                }
                else {
                    cb();
                }
            }, function(err) {
                //done looping players
                if (tracked) {
                    insertMatch(match, function(err) {
                        cb(err);
                    });
                }
                else {
                    cb(err);
                }
            });
        }, function(err) {
            if (!err && resp.length) {
                seq_num = resp[resp.length - 1].match_seq_num + 1;
                redis.set("match_seq_num", seq_num);
                //wait 100ms for each match less than 100
                var delay = (100 - resp.length) * 100;
                return setTimeout(function() {
                    scanApi(seq_num);
                }, delay);
            }
            else {
                return scanApi(seq_num);
            }
        });
    });
}
