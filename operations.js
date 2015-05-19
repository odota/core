var db = require('./db');
var utility = require('./utility');
var convert64to32 = utility.convert64to32;
var generateJob = utility.generateJob;
var async = require('async');
var r = require("./redis");
var jobs = r.jobs;
var redis = r.client;

function insertMatch(match, cb) {
    async.series([function(cb) {
            //put api data in db
            //set to queued, unless we specified something earlier (like skipped)
            match.parse_status = match.parse_status || 0;
            db.matches.update({
                match_id: match.match_id
            }, {
                $set: match
            }, {
                upsert: true
            }, cb);
            },
            function(cb) {
            //insert players into db
            async.eachSeries(match.players, function(p, cb) {
                //TODO do basic aggregations, findandmodify
                //win/lose/games/matchups/teammates/matches
                //if doesn't exist, don't increment
                //TODO don't increment if this is a re-insert
                //build capped collection of most recent 10 matches
                //db.products.update({},{$push:{last_viewed:{$each:["skis"],$slice:-5}}})
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
            }, cb);
            }], function decideParse(err) {
        if (err) {
            //error occured
            return cb(err);
        }
        else if (match.parse_status !== 0) {
            //not parsing this match (skipped or expired)
            //this isn't a error, although we want to report that back to user if it was a request
            cb(err);
        }
        else {
            if (match.request) {
                return queueReq("request_parse", match, function(err, job2) {
                    cb(err, job2);
                });
            }
            else {
                //queue it and finish
                return queueReq("parse", match, function(err, job2) {
                    cb(err, job2);
                });
            }
        }
    });
}

function insertMatchProgress(match, job, cb) {
    insertMatch(match, function(err, job2) {
        if (err) {
            return cb(err);
        }
        if (!job2) {
            job.progress(100, 100, "not queued for parse");
            cb(err);
        }
        else {
            //wait for parse to finish
            job.progress(0, 100, "parse: starting");
            //request, parse and log the progress
            job2.on('progress', function(prog) {
                job.progress(prog, 100, "parse: progress");
            });
            job2.on('failed', function() {
                cb("parse: failed");
            });
            job2.on('complete', function() {
                job.progress(100, 100, "parse: complete");
                cb();
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
    var kuejob = jobs.create(job.type, job).attempts(payload.attempts || 15).backoff({
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
    insertMatchProgress: insertMatchProgress,
    queueReq: queueReq
};