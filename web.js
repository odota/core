var app;
if (process.env.RETRIEVER) {
    app = require('./retriever').app;
}
else {
    app = require('./yasp').app;
}
//====
var async = require("async"),
    utility = require('./utility'),
    matches = utility.matches,
    players = utility.players,
    logger = utility.logger,
    moment = require('moment'),
    fs = require('fs'),
    jobs = utility.jobs;
var trackedPlayers = {};
var UNTRACK_INTERVAL_DAYS = process.env.UNTRACK_INTERVAL_DAYS || 3;

utility.clearActiveJobs('api', function(err) {
    if (err) {
        logger.info(err);
    }
    jobs.process('api', processApiReq);
});

utility.clearActiveJobs('upload', function(err) {
    if (err) {
        logger.info(err);
    }
    jobs.process('upload', processUpload);
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
        if (err) {
            logger.info(err);
        }
        logger.info("[UNTRACK] Untracked %s users", num);
    });
}, 60 * 60 * 1000); //check every hour

function getMatches(seq_num) {
    setTimeout(function() {
        players.find({
            track: 1
        }, function(err, docs) {
            if (err) {
                return getMatches(seq_num);
            }
            //rebuild set of tracked players before every check
            trackedPlayers = {};
            docs.forEach(function(player) {
                trackedPlayers[player.account_id] = true;
            });
            var url = utility.api_url + "/GetMatchHistoryBySequenceNum/V001/?key=" + process.env.STEAM_API_KEY + "&start_at_match_seq_num=" + seq_num;
            utility.getData(url, function(err, data) {
                if (err) {
                    return getMatches(seq_num);
                }
                var resp = data.result.matches;
                logger.info("[API] seq_num: %s, found %s matches", seq_num, resp.length);
                async.mapSeries(resp, insertMatch, function(err) {
                    if (err) {
                        return getMatches(seq_num);
                    }
                    if (resp.length > 0) {
                        seq_num = resp[resp.length - 1].match_seq_num + 1;
                    }
                    return getMatches(seq_num);
                });
            });
        });
    }, 1000);
}

function processApiReq(job, cb) {
    setTimeout(function() {
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
    }, 1000);
}

function insertMatch(match, cb) {
    var track = match.players.some(function(element) {
        return (element.account_id in trackedPlayers);
    });
    //queued or untracked
    match.parse_status = (track ? 0 : 3);
    if (track || match.upload) {
        var summaries = {
            summaries_id: new Date(),
            players: match.players
        };
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
    player.last_summaries_update = new Date();
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
    //====
var request = require("request"),
    fs = require("fs"),
    moment = require('moment'),
    Bunzip = require('seek-bzip'),
    spawn = require('child_process').spawn,
    utility = require('./utility'),
    matches = utility.matches,
    AWS = require('aws-sdk'),
    async = require('async');
var jobs = utility.jobs;
var logger = utility.logger;
var replay_dir = "replays/";
var retrievers = process.env.RETRIEVER_HOST.split(",");

utility.clearActiveJobs('parse', function(err) {
    if (err) {
        logger.info(err);
    }
    jobs.process('parse', parseReplayFile);
});

function parseReplayFile(job, cb) {
    async.waterfall([
        async.apply(checkDuplicate, job),
        checkLocal,
        getReplayUrl,
        download,
        parseFile,
        insertParse,
    ], function(err, job) {
        handleErrors(err, job, function(err) {
            cb(err);
        });
    });
}

function parseReplayStream(job, cb) {
    async.waterfall([
        async.apply(checkDuplicate, job),
        getReplayUrl,
        parseStream,
        insertParse,
    ], function(err, job) {
        handleErrors(err, job, function(err) {
            cb(err);
        });
    });
}

function parseStream(job, url, cb) {
    //todo stream download, decompress, and parse
    //todo need to modify parser to support streaming input
}

function checkDuplicate(job, cb) {
    matches.findOne({
        match_id: job.data.payload.match_id
    }, function(err, doc) {
        if (!err && doc && doc.parsed_data) {
            //match already has parsed data
            cb("already parsed");
        }
        else {
            cb(null, job);
        }
    });
}

function checkLocal(job, cb) {
    var match_id = job.data.payload.match_id;
    var fileName = replay_dir + match_id + ".dem";
    if (fs.existsSync(fileName)) {
        logger.info("[PARSER] %s, found local replay", match_id);
        job.data.fileName = fileName;
        job.update();
        cb(null, job);
    }
}

function getReplayUrl(job, cb) {
    if (job.data.url || job.data.fileName) {
        return cb(null, job, job.data.url);
    }
    var match = job.data.payload;
    if (match.start_time > moment().subtract(7, 'days').format('X')) {
        var urls = [];
        for (var i = 0; i < retrievers.length; i++) {
            urls[i] = retrievers[i] + "?match_id=" + job.data.payload.match_id;
        }
        utility.getData(urls, function(err, body) {
            if (!err && body && body.match) {
                var url = "http://replay" + body.match.cluster + ".valve.net/570/" + match.match_id + "_" + body.match.replaySalt + ".dem.bz2";
                return cb(null, job, url);
            }
            logger.info(err, body);
            return cb("invalid body or error");
        });
    }
    else {
        getS3URL(match.match_id, function(err, url) {
            cb(err, job, url);
        });
    }
}

function download(job, url, cb) {
    if (job.data.fileName) {
        return cb(null, job, job.data.fileName);
    }
    if (!fs.existsSync(replay_dir)) {
        fs.mkdir(replay_dir);
    }
    job.data.url = url;
    job.update();
    var match_id = job.data.payload.match_id;
    getReplayUrl(job, function(err, url) {
        if (err) {
            return cb(err);
        }
        logger.info("[PARSER] downloading from %s", url);
        var t1 = new Date().getTime();
        request({
            url: url,
            encoding: null
        }, function(err, resp, body) {
            if (err || resp.statusCode !== 200) {
                return cb("DOWNLOAD ERROR");
            }
            var t2 = new Date().getTime();
            logger.info("[PARSER] %s, dl time: %s", match_id, (t2 - t1) / 1000);
            var fileName = replay_dir + match_id + ".dem";
            var archiveName = fileName + ".bz2";
            uploadToS3(archiveName, body, function(err) {
                if (err) return logger.info(err);
            });
            //decompress the input data to given fileName
            decompress(body, fileName, function(err) {
                if (err) {
                    return cb(err);
                }
                var t3 = new Date().getTime();
                logger.info("[PARSER] %s, decomp time: %s", match_id, (t3 - t2) / 1000);
                cb(err, job, fileName);
            });
        });
    });
}

function decompress(comp, fileName, cb) {
    //writes to compressed file, then decompresses file using bzip2
    var archiveName = fileName + ".bz2";
    fs.writeFile(archiveName, comp, function(err) {
        if (err) {
            return cb(err);
        }
        var cp = spawn("bunzip2", [archiveName]);
        cp.on('exit', function(code) {
            if (code) {
                return cb(code);
            }
            cb(code, fileName);
        });
    });
}

function decompress2(comp, fileName, cb) {
    //decompresses file in memory using seek-bzip, then writes to decompressed file
    try {
        var decomp = Bunzip.decode(comp);
        fs.writeFile(fileName, decomp, function(err) {
            if (err) {
                return cb(err);
            }
            cb(err, fileName);
        });
    }
    catch (e) {
        return cb(e);
    }
}

function parseFile(job, fileName, cb) {
    var match_id = job.data.payload.match_id;
    var t3 = new Date().getTime();
    utility.runParse(fileName, function(err, output) {
        if (err) {
            return cb(err);
        }
        var t4 = new Date().getTime();
        logger.info("[PARSER] %s, parse time: %s", match_id, (t4 - t3) / 1000);
        if (process.env.DELETE_REPLAYS) {
            fs.unlink(fileName, function(err) {
                logger.info(err);
            });
        }
        cb(err, job, output);
    });
}

function insertParse(job, output, cb) {
    //insert parse results into db
    matches.update({
        match_id: output.match_id
    }, {
        $set: {
            parsed_data: output,
            parse_status: 2
        }
    }, function(err) {
        cb(err, job);
    });
}

function handleErrors(err, job, cb) {
    var match_id = job.data.payload.match_id;
    if (err) {
        logger.info("[PARSER] error on match %s: %s", match_id, err);
        if (job.attempts.remaining === 0 || err === "S3 UNAVAILABLE") {
            //don't retry
            matches.update({
                match_id: match_id
            }, {
                $set: {
                    parse_status: 1
                }
            });
            //todo this isn't optimal since this marks the job as complete, so it immediately disappears
            return cb(null);
        }
        else {
            //retry
            return cb(err);
        }
    }
}

function getS3URL(match_id, cb) {
    if (process.env.AWS_S3_BUCKET) {
        var archiveName = match_id + ".dem.bz2";
        var s3 = new AWS.S3();
        var params = {
            Bucket: process.env.AWS_S3_BUCKET,
            Key: archiveName
        };
        s3.headObject(params, function(err, data) {
            if (!err) {
                var url = s3.getSignedUrl('getObject', params);
                cb(null, url);
            }
            else {
                logger.info("[S3] %s not in S3", match_id);
                cb("S3 UNAVAILABLE");
            }
        });
    }
    else {
        cb("S3 UNAVAILABLE");
    }
}

function uploadToS3(archiveName, body, cb) {
    if (process.env.AWS_S3_BUCKET) {
        var s3 = new AWS.S3();
        var params = {
            Bucket: process.env.AWS_S3_BUCKET,
            Key: archiveName
        };
        params.Body = body;
        s3.putObject(params, function(err, data) {
            logger.info(err, data);
            cb(err);
        });
    }
    else {
        logger.info("[S3] S3 not defined (skipping upload)");
        cb(null);
    }
}