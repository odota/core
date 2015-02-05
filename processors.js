var utility = require('./utility');
var async = require('async');
var db = utility.db;
var logger = utility.logger;
var fs = require('fs');
var moment = require('moment');
var getData = utility.getData;
var request = require('request');
var insertPlayer = utility.insertPlayer;
var insertMatch = utility.insertMatch;
var spawn = require('child_process').spawn;
var replay_dir = process.env.REPLAY_DIR || "./replays/";
var domain = require('domain');

function processParse(job, cb) {
    var t1 = new Date();
    var match_id = job.data.payload.match_id;
    var noRetry = job.toJSON().attempts.remaining <= 1;
    async.waterfall([
        async.apply(checkLocal, job),
        getReplayUrl,
        streamReplay,
    ], function(err, job2) {
        logger.info("[PARSER] parse time: %s", (new Date() - t1) / 1000);
        if (err === "replay expired" || noRetry) {
            logger.info("error %s, not retrying", err);
            return db.matches.update({
                match_id: match_id
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
            logger.info("error %s, retrying", err);
            return cb(err);
        }
        else {
            return cb(err);
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
        getData("http://retriever?match_id="+ job.data.payload.match_id, function(err, body) {
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
    var parser = utility.runParse(function(err, output) {
        if (err) {
            return cb(err);
        }
        db.matches.update({
            match_id: match_id
        }, {
            $set: {
                parsed_data: output,
                parse_status: 2
            }
        }, function(err) {
            cb(err, job);
        });
    });
    var d = domain.create();
    if (job.data.fileName) {
        d.on('error', function(err) {
            parser.kill();
            return cb(err);
        });
        d.run(function() {
            fs.createReadStream(job.data.fileName).pipe(parser.stdin);
        });
    }
    else {
        var bz = spawn("bzcat");
        d.on('error', function(err) {
            bz.kill();
            parser.kill();
            return cb(err);
        });
        d.run(function() {
            var downStream = request.get({
                url: job.data.url,
                encoding: null,
                timeout: 120000
            });
            downStream.on('response', function(resp) {
                if (resp.statusCode !== 200) {
                    throw "download error";
                }
            });
            downStream.on('error', function(err) {
                throw err;
            });
            downStream.pipe(bz.stdin);
            bz.stdout.pipe(parser.stdin);
        });
    }
}

function processApi(job, cb) {
    //process an api request
    var payload = job.data.payload;
    getData(job.data.url, function(err, data) {
        if (err) {
            return cb(err);
        }
        if (data.response) {
            logger.info("summaries response");
            async.map(data.response.players, insertPlayer, function(err) {
                cb(err);
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
                cb(err);
            });
        }
        else {
            return cb("unknown response");
        }
    });
}

module.exports = {
    processParse: processParse,
    processApi: processApi
};
