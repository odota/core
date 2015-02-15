var utility = require('./utility');
var async = require('async');
var db = require('./db');
var logger = utility.logger;
var fs = require('fs');
var moment = require('moment');
var getData = utility.getData;
var request = require('request');
var operations = require('./operations');
var insertPlayer = operations.insertPlayer;
var insertMatch = operations.insertMatch;
var spawn = require('child_process').spawn;
var replay_dir = process.env.REPLAY_DIR || "./replays/";
var domain = require('domain');
var queueReq = operations.queueReq;

function processParse(job, cb) {
    var t1 = new Date();
    var attempts = job.toJSON().attempts.remaining;
    var noRetry = attempts <= 1;
    async.waterfall([
        async.apply(checkLocal, job),
        getReplayUrl,
        streamReplay,
    ], function(err) {
        var match_id = job.data.payload.match_id;
        logger.info("[PARSER] match_id %s, parse time: %s", match_id, (new Date() - t1) / 1000);
        if (err === "replay expired" || (err && noRetry)) {
            logger.info("match_id %s, error %s, not retrying", match_id, err);
            return db.matches.update({
                match_id: match_id,
                parse_status: 0
            }, {
                $set: {
                    parse_status: 1
                }
            }, function(err2) {
                //nullify error if replay expired
                err = err === "replay expired" ? null : err;
                cb(err || err2);
            });
        }
        else if (err) {
            logger.info("match_id %s, error %s, attempts %s", match_id, err, attempts);
            return cb(err);
        }
        else {
            return cb(err, job.data.payload);
        }
    });
}

function checkLocal(job, cb) {
    var match_id = job.data.payload.match_id;
    var fileName = job.data.fileName || replay_dir + match_id + ".dem";
    if (fs.existsSync(fileName)) {
        logger.info("[PARSER] %s, found local replay", match_id);
        job.data.fileName = fileName;
        job.update();
    }
    cb(null, job);
}

function getReplayUrl(job, cb) {
    if (job.data.url || job.data.fileName) {
        logger.info("has url or fileName");
        return cb(null, job);
    }
    var match = job.data.payload;
    if (match.start_time > moment().subtract(7, 'days').format('X')) {
        getData("http://retriever?match_id=" + job.data.payload.match_id, function(err, body) {
            if (err || !body || !body.match) {
                return cb("invalid body or error");
            }
            var url = "http://replay" + body.match.cluster + ".valve.net/570/" + match.match_id + "_" + body.match.replaySalt + ".dem.bz2";
            job.data.url = url;
            job.data.payload.url = url;
            job.update();
            return cb(null, job);
        });
    }
    /*
    else if (process.env.AWS_S3_BUCKET) {
        getS3Url(match.match_id, function(err, url) {
            if (!url) {
                return cb("replay expired");
            }
            job.data.url = url;
            job.update();
            return cb(err, job);
        });
    }
    */
    else {
        cb("replay expired");
    }
}

function streamReplay(job, cb) {
    //var fileName = replay_dir + match_id + ".dem";
    //var archiveName = fileName + ".bz2";
    var match_id = job.data.payload.match_id;
    logger.info("[PARSER] streaming from %s", job.data.url || job.data.fileName);
    var d = domain.create();
    var bz;
    var parser;
    var error;
    var inStream;
    var to = setTimeout(function() {
        error = "timeout";
        inStream.end();
        //job.failed().error("timeout");
        //process.exit(1);
    }, 180000);
    d.on('error', function(err) {
        clearTimeout(to);
        cb(error || err);
    });
    d.run(function() {
        parser = utility.runParse(function(err, output) {
            clearTimeout(to);
            if (err) {
                return cb(err);
            }
            match_id = match_id || output.match_id;
            job.data.payload.match_id = match_id;
            job.data.payload.parsed_data = output;
            job.data.payload.parse_status = 2;
            job.update();
            db.matches.find({
                match_id: match_id
            }, function(err, docs) {
                if (err) {
                    return cb(err);
                }
                else if (docs.length) {
                    db.matches.update({
                        match_id: match_id
                    }, {
                        $set: job.data.payload,
                    }, function(err) {
                        return cb(err);
                    });
                }
                else {
                    console.log("parsed match not in db");
                    queueReq("api_details", job.data.payload, function(err, apijob) {
                        if (err) {
                            return cb(err);
                        }
                        apijob.on('complete', function() {
                            return cb();
                        });
                    });
                }
            });
        });
        if (job.data.fileName) {
            inStream = fs.createReadStream(job.data.fileName);
            inStream.pipe(parser.stdin);
        }
        else {
            bz = spawn("bzcat");
            bz.stdout.pipe(parser.stdin);
            inStream = request.get({
                url: job.data.url,
                encoding: null
            });
            inStream.on('response', function(resp) {
                if (resp.statusCode !== 200) {
                    error = "download error";
                }
            }).pipe(bz.stdin);
        }
    });
}

function processApi(job, cb) {
    //process an api request
    var payload = job.data.payload;
    getData(job.data.url, function(err, data) {
        if (err) {
            //encountered non-retryable error, pass back to kue as the result
            //cb with err causes kue to retry
            return cb(null, {
                error: err
            });
        }
        else if (data.response) {
            logger.info("summaries response");
            async.mapSeries(data.response.players, insertPlayer, function(err) {
                cb(err, job.data.payload);
            });
        }
        else if (payload.match_id) {
            logger.info("details response");
            var match = data.result;
            //join payload with match
            for (var prop in payload) {
                match[prop] = match[prop] ? match[prop] : payload[prop];
            }
            insertMatch(match, function(err) {
                cb(err, job.data.payload);
            });
        }
        else {
            return cb("unknown response");
        }
    });
}

function processMmr(job, cb) {
    var payload = job.data.payload;
    getData(job.data.url, function(err, data) {
        if (err) {
            return cb(null, err);
        }
        logger.info("mmr response");
        if (data.soloCompetitiveRank || data.competitiveRank) {
            db.ratings.insert({
                match_id: payload.match_id,
                account_id: payload.account_id,
                soloCompetitiveRank: data.soloCompetitiveRank,
                competitiveRank: data.competitiveRank,
                time: new Date()
            }, function(err) {
                cb(err);
            });
        }
        else {
            cb(null);
        }
    });
}

module.exports = {
    processParse: processParse,
    processApi: processApi,
    processMmr: processMmr
};
