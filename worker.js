var utility = require('./utility');
var config = require('./config');
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
var domain = require('domain');
var constants = require('./constants.json');
var trackedPlayers = {};
var ratingPlayers = {};
var seaport = require('seaport');
var server = seaport.createServer();
server.listen(config.REGISTRY_PORT);
var retrievers = config.RETRIEVER_HOST;
retrievers.split(",").forEach(function(r) {
    server.register('retriever@' + constants.retriever_version + '.0.0', {
        url: "http://" + r
    });
});
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
var d = domain.create();
d.on('error', function(err) {
    console.log(err.stack);
    clearActiveJobs(function(err2) {
        process.exit(err2 || err || 1);
    });
});
d.run(function() {
    build(function() {
        console.log("[WORKER] starting worker");
        startScan();
        jobs.promote();
        jobs.process('api', processors.processApi);
        jobs.process('mmr', processors.processMmr);
        setInterval(fullhistory, 17 * 60 * 1000, function() {});
        setInterval(updatenames, 3 * 60 * 1000, function() {});
        setInterval(apiStatus, 2 * 60 * 1000);
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

function build(cb) {
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
        "retrievers": function(cb) {
            server.get('retriever@' + constants.retriever_version + '.0.0', function(ps) {
                ps = ps.map(function(p) {
                    return p.url || 'http://' + p.host + ':' + p.port;
                });
                var r = {};
                var b = [];
                async.each(ps, function(url, cb) {
                    getData(url, function(err, body) {
                        if (err) {
                            return cb(err);
                        }
                        for (var key in body.accounts) {
                            b.push(body.accounts[key]);
                        }
                        for (var key in body.accountToIdx) {
                            r[key] = url + "?account_id=" + key;
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
            });
        }
    }, function(err, result) {
        if (err) {
            return build(cb);
        }
        result.ratingPlayers = result.retrievers.ratingPlayers;
        result.bots = result.retrievers.bots;
        result.retrievers = result.retrievers.retrievers;
        trackedPlayers = result.trackedPlayers;
        ratingPlayers = result.ratingPlayers;
        for (var key in result) {
            redis.set(key, JSON.stringify(result[key]));
        }
        setTimeout(build, 3 * 60 * 1000, function() {});
        cb(err);
    });
}

function startScan() {
    if (config.START_SEQ_NUM === "AUTO") {
        var container = generateJob("api_history", {});
        getData(container.url, function(err, data) {
            if (err) {
                return startScan();
            }
            scanApi(data.result.matches[0].match_seq_num);
        });
    }
    else if (config.START_SEQ_NUM) {
        scanApi(config.START_SEQ_NUM);
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
var q = async.queue(function(match, cb) {
    var tracked = false;
    async.each(match.players, function(p, cb) {
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
        if (!err) {
            redis.set("match_seq_num", match.match_seq_num);
        }
        if (tracked) {
            insertMatch(match, function(err) {
                cb(err);
            });
        }
        else {
            cb(err);
        }
    });
});

function scanApi(seq_num) {
    var container = generateJob("api_sequence", {
        start_at_match_seq_num: seq_num
    });
    getData(container.url, function(err, data) {
        if (err) {
            return scanApi(seq_num);
        }
        var resp = data.result.matches;
        var next_seq_num = seq_num;
        if (resp.length) {
            next_seq_num = resp[resp.length - 1].match_seq_num + 1;
        }
        logger.info("[API] seq_num:%s, matches:%s, queue:%s", seq_num, resp.length, q.length());
        q.push(resp);
        //wait 100ms for each match less than 100
        var delay = (100 - resp.length) * 100;
        setTimeout(function() {
            scanApi(next_seq_num);
        }, delay);
    });
}

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
