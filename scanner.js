var utility = require('./utility');
var config = require('./config');
var getData = utility.getData;
var r = require('./redis');
var redis = r.client;
var logger = utility.logger;
var generateJob = utility.generateJob;
var async = require('async');
var operations = require('./operations');
var insertMatch = operations.insertMatch;
var queueReq = operations.queueReq;
var queries = require('./queries');
var trackedPlayers;
var userPlayers;
var ratingPlayers;
var permanent = {
    88367253: true
};
startScan();

function startScan() {
    if (config.START_SEQ_NUM === "AUTO") {
        var container = generateJob("api_history", {});
        getData(container.url, function(err, data) {
            if (err) {
                console.log("failed to get sequence number from webapi");
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
                result = Number(result);
                scanApi(result);
            }
            else {
                console.log("no sequence number in redis!");
                return startScan();
            }
        });
    }
}
var q = async.queue(function(match, cb) {
    async.each(match.players, function(p, cb) {
        if (p.account_id in trackedPlayers || p.account_id in permanent) {
            //queued
            match.parse_status = 0;
        }
        if (p.account_id in userPlayers && match.parse_status !== 0) {
            //skipped, but only if not already queued
            match.parse_status = 3;
        }
        if (p.account_id in ratingPlayers && match.lobby_type === 7) {
            //could possibly pick up MMR change for matches we don't add, this is probably ok
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
        if (err) {
            return cb(err);
        }
        if (match.parse_status === 0 || match.parse_status === 3) {
            insertMatch(match, function(err) {
                cb(err, match);
            });
        }
        else {
            cb(err, match);
        }
    });
});

function scanApi(seq_num) {
    var container = generateJob("api_sequence", {
        start_at_match_seq_num: seq_num
    });
    queries.getSets(function(err, result) {
        if (err) {
            console.log("failed to getSets from redis");
            return scanApi(seq_num);
        }
        //set local vars
        trackedPlayers = result.trackedPlayers;
        ratingPlayers = result.ratingPlayers;
        userPlayers = result.userPlayers;
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
            q.push(resp, function(err, match) {
                if (err) {
                    console.log("failed to insert match from scanApi %s", match);
                    console.log(err);
                    //todo log this to a file or something, we don't want to stop/crash just because an insert failed
                    //throw err;
                }
                else {
                    //set the redis progress
                    redis.set("match_seq_num", match.match_seq_num);
                }
            });
            //wait 100ms for each match less than 100
            var delay = (100 - resp.length) * 100;
            setTimeout(function() {
                scanApi(next_seq_num);
            }, delay);
        });
    });
}
