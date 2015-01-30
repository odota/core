var dotenv = require('dotenv');
dotenv.load();
var utility = require('./utility');
var processors = require('./processors');
var tasks = require('./tasks');
var getData = utility.getData;
var db = utility.db;
var logger = utility.logger;
var generateJob = utility.generateJob;
var async = require('async');
var insertMatch = utility.insertMatch;
var jobs = utility.jobs;

startScan();
jobs.process('api', processors.processApi);
setInterval(tasks.clearActiveJobs, 60 * 1000, function() {});
setInterval(tasks.untrackPlayers, 60 * 60 * 1000, function() {});
setInterval(tasks.getFullMatchHistory, 2 * 60 * 60 * 1000, function() {});
setInterval(tasks.unnamed, 30 * 60 * 1000, function() {});

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
        //start at highest id in db
        db.matches.findOne({
            uploader: null
        }, {
            sort: {
                match_seq_num: -1
            }
        }, function(err, doc) {
            if (err) {
                return startScan();
            }
            scanApi(doc ? doc.match_seq_num + 1 : 0);
        });
    }
}

function scanApi(seq_num) {
    var trackedPlayers = {};
    db.players.find({
        track: 1
    }, function(err, docs) {
        if (err) {
            return scanApi(seq_num);
        }
        //rebuild set of tracked players before every check
        trackedPlayers = {};
        docs.forEach(function(player) {
            trackedPlayers[player.account_id] = true;
        });
        var container = generateJob("api_sequence", {
            seq_num: seq_num
        });
        getData(container.url, function(err, data) {
            if (err) {
                return scanApi(seq_num);
            }
            var resp = data.result.matches;
            var new_seq_num = seq_num;
            if (resp.length > 0) {
                new_seq_num = resp[resp.length - 1].match_seq_num + 1;
            }
            var filtered = [];
            for (var i = 0; i < resp.length; i++) {
                var match = resp[i];
                if (match.players.some(function(element) {
                        return (element.account_id in trackedPlayers);
                    })) {
                    filtered.push(match);
                }
            }
            logger.info("[API] seq_num: %s, found %s matches", seq_num, resp.length);
            async.mapSeries(filtered, insertMatch, function(err) {
                if (err) {
                    logger.info(err);
                }
                return scanApi(new_seq_num);
            });
        });
    });
}
