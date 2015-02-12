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
    var error;
    var bz;
    var parser;
    d.on('error', function(err) {
        if (!error) {
            //only cb with first error
            error = err;
            if (bz) {
                bz.kill();
            }
            if (parser) {
                parser.kill();
            }
            cb(error);
        }
    });
    d.run(function() {
        parser = utility.runParse(function(err, output) {
            if (err) {
                throw err;
            }
            match_id = match_id || output.match_id;
            job.data.payload.match_id = match_id;
            job.update();
            var res = {
                match_id: match_id,
                parsed_data: output,
                parse_status: 2
            };
            db.matches.findOne({
                match_id: match_id
            }, function(err, doc) {
                if (err) {
                    return cb(err);
                }
                else if (!doc) {
                    queueReq("api_details", res, function(err, apijob) {
                        if (err) {
                            return cb(err);
                        }
                        apijob.on('complete', function(err) {
                            cb(err);
                        });
                    });
                }
                else {
                    db.matches.update(doc, {
                        $set: res,
                    }, function(err) {
                        cb(err);
                    });
                }
            });
        });
        if (job.data.fileName) {
            fs.createReadStream(job.data.fileName).pipe(parser.stdin);
        }
        else {
            var downStream = request.get({
                url: job.data.url,
                encoding: null,
                timeout: 180000
            });
            downStream.on('response', function(resp) {
                if (resp.statusCode !== 200) {
                    throw "download error";
                }
            });
            bz = spawn("bzcat");
            downStream.pipe(bz.stdin);
            bz.stdout.pipe(parser.stdin);
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
        if (data.response) {
            logger.info("summaries response");
            async.map(data.response.players, insertPlayer, function(err) {
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
                competitiveRank: data.competitiveRank
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
