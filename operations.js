var db = require('./db');
var utility = require('./utility');
var convert64to32 = utility.convert64to32;
var generateJob = utility.generateJob;
var async = require('async');
var jobs = require("./redis").jobs;

function insertMatch(match, cb) {
    match.parse_status = match.parsed_data ? 2 : 0;
    db.matches.update({
            match_id: match.match_id
        }, {
            $set: match
        }, {
            upsert: true
        },
        function(err) {
            if (err) {
                return cb(err);
            }
            //add players in match to db
            async.mapSeries(match.players, function(player, cb) {
                db.players.update({
                    account_id: player.account_id
                }, {
                    $set: {
                        account_id: player.account_id
                    }
                }, {
                    upsert: true
                }, function(err) {
                    cb(err);
                });
            }, function(err) {
                if (!match.parse_status) {
                    queueReq("parse", match, function(err) {
                        cb(err);
                    });
                }
                else {
                    cb(err);
                }
            });
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
    checkDuplicate(type, payload, function(err, doc) {
        if (err) {
            return cb(err);
        }
        if (doc) {
            console.log("duplicate found");
            return cb(null);
        }
        var job = generateJob(type, payload);
        var kuejob = jobs.create(job.type, job).attempts(10).backoff({
            delay: 60 * 1000,
            type: 'exponential'
        }).removeOnComplete(true).priority(payload.priority || 'normal').save(function(err) {
            console.log("[KUE] created jobid: %s", kuejob.id);
            cb(err, kuejob);
        });
    });
}

function checkDuplicate(type, payload, cb) {
    if (type === "api_details" && payload.match_id) {
        //make sure match doesn't exist already in db before queueing for api
        db.matches.findOne({
            match_id: payload.match_id
        }, function(err, doc) {
            cb(err, doc);
        });
    }
    else {
        //no duplicate check for anything else
        cb(null);
    }
}

module.exports = {
    insertPlayer: insertPlayer,
    insertMatch: insertMatch,
    queueReq: queueReq
};