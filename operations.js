var db = require('./db');
var utility = require('./utility');
var convert64to32 = utility.convert64to32;
var generateJob = utility.generateJob;
var async = require('async');
var r = require("./redis");
var jobs = r.jobs;
var redis = r.client;
var moment = require('moment');
var getData = utility.getData;

function insertMatch(match, cb) {
    getReplayUrl(match, function(err) {
        if (err) {
            return cb(err);
        }
        db.matches.update({
            match_id: match.match_id
        }, {
            $set: match
        }, {
            upsert: true
        }, function(err) {
            if (err) {
                return cb(err);
            }
            async.eachSeries(match.players, function(p, cb) {
                db.players.update({
                    account_id: p.account_id
                }, {
                    $set: {
                        account_id: p.account_id
                    }
                }, {
                    upsert: true
                }, function(err) {
                    cb(err);
                });
            }, function(err) {
                if (err || match.expired) {
                    return cb(err);
                }
                else {
                    queueReq("parse", match, function(err, job) {
                        cb(err, job);
                    });
                }
            });
        });
    });
}

function getReplayUrl(match, cb) {
    db.matches.findOne({
        match_id: match.match_id
    }, function(err, doc) {
        if (match.start_time < moment().subtract(7, 'days').format('X')) {
            match.expired = true;
            match.parse_status = (doc && doc.parse_status) ? doc.parse_status : 1;
            return cb();
        }
        match.parse_status = (doc && doc.parse_status) ? doc.parse_status : 0;
        if (!err && doc && doc.url) {
            console.log("replay url in db");
            match.url = doc.url;
            return cb(err);
        }
        else {
            redis.get("retrievers", function(err, result) {
                if (err) {
                    return cb(err);
                }
                result = JSON.parse(result);
                var urls = result.map(function(r) {
                    return r + "?match_id=" + match.match_id;
                });
                getData(urls, function(err, body) {
                    if (err || !body || !body.match) {
                        //non-retryable error
                        return cb("invalid body or error");
                    }
                    var url = "http://replay" + body.match.cluster + ".valve.net/570/" + match.match_id + "_" + body.match.replaySalt + ".dem.bz2";
                    match.url = url;
                    cb(err);
                });
            });
        }
    });
}

function insertPlayer(player, cb) {
    var account_id = Number(convert64to32(player.steamid));
    player.last_summaries_update = new Date();
    db.players.update({
        account_id: account_id
    }, {
        $set: player
    }, {
        upsert: true
    }, function(err) {
        cb(err);
    });
}

function queueReq(type, payload, cb) {
    var job = generateJob(type, payload);
    var kuejob = jobs.create(job.type, job).attempts(10).backoff({
        delay: 60 * 1000,
        type: 'exponential'
    }).removeOnComplete(true).priority(payload.priority || 'normal').save(function(err) {
        console.log("[KUE] created jobid: %s", kuejob.id);
        cb(err, kuejob);
    });
}
module.exports = {
    insertPlayer: insertPlayer,
    insertMatch: insertMatch,
    queueReq: queueReq
};