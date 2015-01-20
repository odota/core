var async = require("async"),
    utility = require('./utility'),
    matches = utility.matches,
    players = utility.players,
    winston = require('winston'),
    jobs = utility.jobs,
    trackedPlayers = {},
    transports = [new(winston.transports.Console)(),
        new(winston.transports.File)({
            filename: 'backend.log',
            level: 'info'
        })
    ],
    logger = new(winston.Logger)({transports: transports})
    untrack_interval = process.env.UNTRACK_INTERVAL || 3;

utility.clearActiveJobs('api', function(err) {
    if (err) {
        logger.info(err);
    }
    jobs.process('api', function(job, done) {
        setTimeout(function() {
            apiRequest(job, done)
        }, 1000)
    })
})

if (process.env.START_SEQ_NUM === "AUTO") {
    utility.getCurrentSeqNum(function(num) {
        getMatches(num);
    })
}
else if (process.env.START_SEQ_NUM) {
    getMatches(process.env.START_SEQ_NUM);
}
else {
    //start at highest id in db
    matches.findOne({}, {
        sort: {
            match_seq_num: -1
        }
    }, function(err, doc) {
        if (err) {
            logger.info(err);
        }
        getMatches(doc ? doc.match_seq_num + 1 : 0)
    })
}

function getMatches(seq_num) {
    setTimeout(function() {
        players.find({
            track: 1
        }, function(err, docs) {
            //rebuild set of tracked players before every check
            trackedPlayers = {}
            docs.forEach(function(player) {
                trackedPlayers[player.account_id] = true
            })
            var url = utility.api_url + "/GetMatchHistoryBySequenceNum/V001/?key=" + process.env.STEAM_API_KEY + "&start_at_match_seq_num=" + seq_num;
            utility.getData(url, function(err, data) {
                if (data.result.error || data.result.status == 2) {
                    logger.info(data)
                    return getMatches(seq_num)
                }
                var resp = data.result.matches
                logger.info("[API] seq_num: %s, found %s matches", seq_num, resp.length)
                async.mapSeries(resp, insertMatch, function(err) {
                    if (resp.length > 0) {
                        seq_num = resp[resp.length - 1].match_seq_num + 1
                    }
                    return getMatches(seq_num)
                })
            })
        })
    }, 1000)
}

function apiRequest(job, cb) {
    //process an api request
    var payload = job.data.payload;
    if (!job.data.url) {
        logger.info(job);
        cb("no url");
    }
    utility.getData(job.data.url, function(err, data) {
        if (data.response) {
            //summaries response
            async.map(data.response.players, insertPlayer, function(err) {
                cb(err);
            });
        }
        else if (data.result.status === 15 || data.result.error === "Practice matches are not available via GetMatchDetails") {
            //user does not have stats enabled
            //or attempting to get private match
            //don't retry
            logger.info(data);
            return cb(null);
        }
        else if (data.result.error || data.result.status === 2) {
            //error response from dota api
            logger.info(data);
            return cb(data);
        }
        else if (payload.match_id) {
            //response for single match details
            var match = data.result;
            match.parsed_data = payload.parsed_data;
            insertMatch(match, function(err) {
                cb(err);
            });
        }
        else if (payload.account_id) {
            //response for match history for single player
            var resp = data.result.matches;
            async.map(resp, function(match, cb2) {
                utility.requestDetails(match, function(err) {
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
    if (track) {
        var summaries = {
            summaries_id: new Date()
        }
        var steamids = []
        match.players.forEach(function(player) {
            steamids.push(utility.convert32to64(player.account_id).toString())
        })
        summaries.query = steamids.join();
        //queue for player names
        utility.queueReq("api", summaries);
        //parse if unparsed
        if (match.parsed_data) {
            match.parse_status = 2;
        }
        else {
            utility.queueReq("parse", match);
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
        cb(null)
    }
}

function insertPlayer(player, cb) {
    //Inserts/updates a player in the database

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

function untrackPlayers() {
    logger.info("[UNTRACK] Untracking users...");
    players.update({
        last_visited: {
            $lte: Date.now() - 86400 * untrack_interval
        }
    }, {
        $set: {
            track: 0
        }
    }, {
        multi: true
    },  function(err, num){
        logger.info("[UNTRACK] Untracked " + num + " users.")
    })
}

setInterval(untrackPlayers(), 60*60*1000);
