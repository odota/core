var async = require("async"),
    utility = require('./utility'),
    matches = utility.matches,
    players = utility.players,
    winston = require('winston'),
    moment = require('moment'),
    fs = require('fs'),
    jobs = utility.jobs,
    trackedPlayers = {};

var transports = [new(winston.transports.Console)({
        'timestamp': true
    }),
    new(winston.transports.File)({
        filename: 'backend.log',
        level: 'info'
    })
];
var logger = new(winston.Logger)({
    transports: transports
});
var UNTRACK_INTERVAL_DAYS = process.env.UNTRACK_INTERVAL_DAYS || 3;

utility.clearActiveJobs('api', function(err) {
    if (err) {
        logger.info(err);
    }
    jobs.process('api', function(job, done) {
        setTimeout(function() {
            apiRequest(job, done);
        }, 1000);
    });
});

utility.clearActiveJobs('upload', function(err) {
    if (err) {
        logger.info(err);
    }
    jobs.process('upload', function(job, done) {
        processUpload(job, done);
    });
});

if (process.env.START_SEQ_NUM === "AUTO") {
    utility.getCurrentSeqNum(function(num) {
        getMatches(num);
    });
}
else if (process.env.START_SEQ_NUM) {
    getMatches(process.env.START_SEQ_NUM);
}
else {
    //start at highest id in db
    matches.findOne({
        upload: {
            $exists: false
        }
    }, {
        sort: {
            match_seq_num: -1
        }
    }, function(err, doc) {
        if (err) {
            logger.info(err);
        }
        getMatches(doc ? doc.match_seq_num + 1 : 0);
    });
}
setInterval(function untrackPlayers() {
    logger.info("[UNTRACK] Untracking users...");
    players.update({
        last_visited: {
            $lt: moment().subtract(UNTRACK_INTERVAL_DAYS, 'days').toDate()
        }
    }, {
        $set: {
            track: 0
        }
    }, {
        multi: true
    }, function(err, num) {
        logger.info("[UNTRACK] Untracked " + num + " users.");
    });
}, 60 * 60 * 1000); //check every hour

function getMatches(seq_num) {
    setTimeout(function() {
        players.find({
            track: 1
        }, function(err, docs) {
            //rebuild set of tracked players before every check
            trackedPlayers = {};
            docs.forEach(function(player) {
                trackedPlayers[player.account_id] = true;
            });
            var url = utility.api_url + "/GetMatchHistoryBySequenceNum/V001/?key=" + process.env.STEAM_API_KEY + "&start_at_match_seq_num=" + seq_num;
            utility.getData(url, function(err, data) {
                var resp = data.result.matches;
                logger.info("[API] seq_num: %s, found %s matches", seq_num, resp.length);
                async.mapSeries(resp, insertMatch, function(err) {
                    if (resp.length > 0) {
                        seq_num = resp[resp.length - 1].match_seq_num + 1;
                    }
                    return getMatches(seq_num);
                });
            });
        });
    }, 1000);
}

function apiRequest(job, cb) {
    //process an api request
    var payload = job.data.payload;
    if (!job.data.url) {
        logger.info(job);
        cb("no url");
    }
    utility.getData(job.data.url, function(err, data) {
        if (err) {
            return cb(err);
        }
        if (data.response) {
            //summaries response
            async.map(data.response.players, insertPlayer, function(err) {
                cb(err);
            });
        }
        else if (payload.match_id) {
            //response for single match details
            var match = data.result;
            insertMatch(match, function(err) {
                cb(err);
            });
        }
        else if (payload.account_id) {
            //response for match history for single player
            var resp = data.result.matches;
            async.map(resp, function(match, cb2) {
                utility.queueReq("api_details", match, function(err) {
                    cb2(err);
                });
            }, function(err) {
                cb(err);
            });
        }
    });
}

function insertMatch(match, cb) {
    var track = match.players.some(function(element) {
        return (element.account_id in trackedPlayers);
    });
    //queued or untracked
    match.parse_status = (track ? 0 : 3);
    if (track || match.upload) {
        var summaries = {
            summaries_id: new Date()
        };
        var steamids = [];
        match.players.forEach(function(player) {
            steamids.push(utility.convert32to64(player.account_id).toString());
        });
        summaries.query = steamids.join();
        //queue for player names
        utility.queueReq("api_summaries", summaries, function(err) {
            if (err) return logger.info(err);
        });
        //parse if unparsed
        if (match.parsed_data) {
            match.parse_status = 2;
        }
        else {
            utility.queueReq("parse", match, function(err) {
                if (err) return logger.info(err);
            });
        }
        matches.update({
                match_id: match.match_id
            }, {
                $set: match
            }, {
                upsert: true
            },
            function(err) {
                cb(err);
            });
    }
    else {
        cb(null);
    }
}

function insertPlayer(player, cb) {
    var account_id = Number(utility.convert64to32(player.steamid));
    players.update({
        account_id: account_id
    }, {
        $set: player
    }, {
        upsert: true
    }, function(err) {
        cb(err);
    });
}

function processUpload(job, cb) {
    var fileName = job.data.payload.fileName;
    utility.runParse(fileName, function(code, output) {
        fs.unlink(fileName, function(err) {
            logger.info(err);
        });
        if (!code) {
            var api_container = utility.generateJob("api_details", {
                match_id: output.match_id
            });
            //check api to fill rest of match info
            utility.getData(api_container.url, function(err, body) {
                if (err) {
                    return cb(err);
                }
                var match = body.result;
                match.parsed_data = output;
                match.upload = true;
                insertMatch(match, function(err) {
                    cb(err);
                });
            });
        }
        else {
            //only try once, mark done regardless of result
            cb(null);
        }
    });
}