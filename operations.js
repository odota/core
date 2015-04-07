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
            //get the replay url
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
                    //at this point we may not have a replay url (if the match was expired)
                    //processparse needs to handle this case
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
                });
            });
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

function getReplayUrl(match, cb) {
    db.matches.findOne({
        match_id: match.match_id
    }, function(err, doc) {
        if (match.start_time < moment().subtract(7, 'days').format('X')) {
            console.log("replay expired, not getting replay url");
            //set status to 1 if this match isn't parsed already
            //this ensures we don't mark formerly parsed matches as unavailable on reparses
            match.parse_status = (doc.parse_status === 2) ? doc.parse_status : 1;
            return cb(err);
        }
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
                //make array of retriever urls and use a random one on each retry
                var urls = result.map(function(r) {
                    return r + "&match_id=" + match.match_id;
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