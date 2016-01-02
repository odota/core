var utility = require('./utility');
var config = require('./config');
var getData = utility.getData;
var db = require('./db');
var redis = require('./redis');
var queue = require('./queue');
var logger = utility.logger;
var generateJob = utility.generateJob;
var async = require('async');
var insertMatch = require('./queries').insertMatch;
var queueReq = utility.queueReq;
var queries = require('./queries');
var buildSets = require('./buildSets');
var constants = require('./constants');
var retrieverArr = config.RETRIEVER_HOST.split(",");
var trackedPlayers;
var userPlayers;

// Used to create endpoint for monitoring
var express = require('express');
var moment = require('moment');
var app = express();
var port = config.PORT || config.SCANNER_PORT;
var startedAt = moment();

app.route("/").get(function(req, res) {
    redis.get("match_seq_num", function(err, result) {
        res.json({
            started_at: startedAt.format(),
            started_ago: startedAt.fromNow(),
            match_seq_num: result || "NOT FOUND"
        })
    })
})

var server = app.listen(port, function() {
    var host = server.address().address;
    console.log('[SCANNER] listening at http://%s:%s', host, port);
});

buildSets(db, redis, function(err) {
    if (err) {
        throw err;
    }
    start();
});

function start() {
    if (config.START_SEQ_NUM === "REDIS") {
        redis.get("match_seq_num", function(err, result) {
            if (err || !result) {
                console.log('failed to get match_seq_num from redis, retrying');
                return setTimeout(start, 10000);
            }
            result = Number(result);
            scanApi(result);
        });
    }
    else if (config.START_SEQ_NUM) {
        scanApi(config.START_SEQ_NUM);
    }
    else {
        var container = generateJob("api_history", {});
        getData(container.url, function(err, data) {
            if (err) {
                console.log("failed to get sequence number from webapi");
                return start();
            }
            scanApi(data.result.matches[0].match_seq_num);
        });
    }
}

function scanApi(seq_num) {
    var container = generateJob("api_sequence", {
        start_at_match_seq_num: seq_num
    });
    queries.getSets(redis, function(err, result) {
        if (err) {
            console.log("failed to getSets from redis");
            return scanApi(seq_num);
        }
        //set local vars
        trackedPlayers = result.trackedPlayers;
        userPlayers = result.userPlayers;
        getData({
            url: container.url,
            delay: Number('config.DEFAULT_DELAY')
        }, function(err, data) {
            if (err) {
                return scanApi(seq_num);
            }
            var resp = data.result && data.result.matches ? data.result.matches : [];
            var next_seq_num = seq_num;
            if (resp.length) {
                next_seq_num = resp[resp.length - 1].match_seq_num + 1;
            }
            logger.info("[API] seq_num:%s, matches:%s", seq_num, resp.length);
            async.eachSeries(resp, function(match, cb) {
                if (match.leagueid && config.ENABLE_PRO_PARSING) {
                    //parse tournament games
                    match.parse_status = 0;
                }
                async.each(match.players, function(p, cb) {
                    if (p.account_id in trackedPlayers) {
                        //queued
                        match.parse_status = 0;
                    }
                    if (p.account_id in userPlayers && match.parse_status !== 0) {
                        //skipped, but only if not already queued
                        match.parse_status = 3;
                    }
                    if (match.lobby_type === 7 && p.account_id !== constants.anonymous_account_id && p.account_id in userPlayers) {
                        //could possibly pick up MMR change for matches we don't add, this is probably ok
                        queueReq(queue, "mmr", {
                            match_id: match.match_id,
                            account_id: p.account_id,
                            //url: ratingPlayers[p.account_id]
                            url: retrieverArr.map(function(r) {
                                return "http://" + r + "?key=" + config.RETRIEVER_SECRET + "&account_id=" + p.account_id;
                            })[p.account_id % retrieverArr.length]
                        }, {
                            attempts: 1
                        }, cb);
                    }
                    else {
                        cb();
                    }
                }, function(err) {
                    if (match.parse_status === 0 || match.parse_status === 3) {
                        //redis.setex("added_match:" + match.match_id, 60 * 60 * 24, "1");
                        redis.zadd("added_match", moment().format('X'), match.match_id);
                        insertMatch(db, redis, queue, match, {
                            type: "api"
                        }, close);
                    }
                    else {
                        close(err);
                    }

                    function close(err) {
                        if (err) {
                            console.error("failed to insert match from scanApi %s", match.match_id);
                        }
                        return cb(err);
                    }
                });
            }, function(err) {
                if (err) {
                    //something bad happened, retry this page
                    console.error(err);
                    return scanApi(seq_num);
                }
                else {
                    redis.set("match_seq_num", next_seq_num);
                    //completed inserting matches
                    return scanApi(next_seq_num);
                }
            });
        });
    });
}
