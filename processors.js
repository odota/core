var utility = require('./utility');
var bzip2 = require('compressjs').Bzip2;
var retrievers = (process.env.RETRIEVER_HOST || "http://localhost:5100").split(",");
var replay_dir = process.env.REPLAY_DIR || "./replays/";
var async = require('async');
var db = utility.db;
var logger = utility.logger;
var fs = require('fs');
var moment = require('moment');
var getData = utility.getData;
var request = require('request');
var runParse = utility.runParse;
var decompress = utility.decompress;
var insertPlayer = utility.insertPlayer;
var insertMatch = utility.insertMatch;
var queueReq = utility.queueReq;

function processParse(job, cb) {
    var match_id = job.data.payload.match_id;
    async.waterfall([
        async.apply(checkLocal, job),
        getReplayUrl,
        getReplayData,
    ], function(err, job2) {
        if (err === "replay expired" || (err && job2 && job2.attempts.remaining <= 0)) {
            logger.info(err);
            db.matches.update({
                match_id: match_id
            }, {
                $set: {
                    parse_status: 1
                }
            }, function(err) {
                cb(err);
            });
        }
        else if (err) {
            logger.info(err);
            cb(err);
        }
        else {
            if (process.env.DELETE_REPLAYS && job2.data.fileName) {
                fs.unlinkSync(job2.data.fileName);
            }
            //queue job for api to make sure it's in db
            queueReq("api_details", job2.data.payload, function(err, apijob) {
                cb(err);
            });
        }
    });
}

function processParseStream(job, cb) {
    job.data.stream = true;
    processParse(job, cb);
}

function checkLocal(job, cb) {
    var match_id = job.data.payload.match_id;
    if (!fs.existsSync(replay_dir)) {
        fs.mkdir(replay_dir);
    }
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
        return cb(null, job, job.data.url);
    }
    var match = job.data.payload;
    if (match.start_time > moment().subtract(7, 'days').format('X')) {
        logger.info("requesting match from dota2");
        var urls = [];
        for (var i = 0; i < retrievers.length; i++) {
            urls[i] = retrievers[i] + "?match_id=" + job.data.payload.match_id;
        }
        getData(urls, function(err, body) {
            if (err || !body || !body.match) {
                return cb("invalid body or error");
            }
            var url = "http://replay" + body.match.cluster + ".valve.net/570/" + match.match_id + "_" + body.match.replaySalt + ".dem.bz2";
            return cb(null, job, url);
        });
    }
    /*
    else if (process.env.AWS_S3_BUCKET) {
        getS3Url(match.match_id, function(err, url) {
            if (!url) {
                return cb("replay expired");
            }
            return cb(err, job, url);
        });
    }
    */
    else {
        logger.info("replay expired");
        cb("replay expired");
    }
}

function getReplayData(job, url, cb) {
    job.data.url = url;
    job.update();
    if (job.data.fileName) {
        parseReplay(job, job.data.fileName, cb);
    }
    else {
        job.data.stream ? streamReplayData(job, url, cb) : downloadReplayData(job, url, cb);
    }
}

function streamReplayData(job, url, cb) {
    var match_id = job.data.payload.match_id;
    var t1 = new Date().getTime();
    logger.info("[PARSER] streaming from %s", url);
    request
        .get({
            url: url,
            encoding: null
        }, function(err, resp, body) {
            if (err || resp.statusCode !== 200 || !body) {
                return cb("download error");
            }
            var t2 = new Date().getTime();
            logger.info("[PARSER] %s, dl time: %s", match_id, (t2 - t1) / 1000);
            var decomp = bzip2.decompressFile(body);
            decomp = new Buffer(decomp);
            var t3 = new Date().getTime();
            logger.info("[PARSER] %s, decomp time: %s", match_id, (t3 - t2) / 1000);
            return parseReplay(job, decomp, cb);
        });
    //todo figure out how to stream data directly through decompressor
    /*
    var rs = request().on('error', function(err){}).pipe(new ReadStream());
    var ws = new DuplexStream();
    bzip2.decompressFile(rs, ws);
    var ps = new ReadStream();
    ws.pipe(ps);
    parseReplay(job, ps, cb);
    var UpperStream = function() {
        stream.Transform.call(this);
    };
    util.inherits(UpperStream, stream.Transform);
    UpperStream.prototype._transform = function(chunk, encoding, cb) {
        this.push((chunk + "").toUpperCase());
        cb();
    };
    */
}

function downloadReplayData(job, url, cb) {
    var match_id = job.data.payload.match_id;
    var fileName = replay_dir + match_id + ".dem";
    var archiveName = fileName + ".bz2";
    logger.info("[PARSER] downloading from %s", url);
    var t1 = new Date().getTime();
    var downStream = request.get({
        url: url,
        encoding: null
    })
    downStream.on('error', function(err) {
        logger.info(err);
        return cb(err);
    });
    downStream.on('end', function() {
        var t2 = new Date().getTime();
        logger.info("[PARSER] %s, dl time: %s", match_id, (t2 - t1) / 1000);
        decompress(archiveName, function(err) {
            if (err) {
                return cb(err);
            }
            job.data.fileName = fileName;
            job.update();
            var t3 = new Date().getTime();
            logger.info("[PARSER] %s, decomp time: %s", match_id, (t3 - t2) / 1000);
            return parseReplay(job, fileName, cb);
        });
    });
    downStream.pipe(fs.createWriteStream(archiveName));
}

function parseReplay(job, input, cb) {
    var match_id = job.data.payload.match_id;
    var t3 = new Date().getTime();
    runParse(input, function(code, output) {
        if (code) {
            return cb(code);
        }
        var t4 = new Date().getTime();
        logger.info("[PARSER] %s, parse time: %s", match_id, (t4 - t3) / 1000);
        job.data.payload.match_id = output.match_id;
        job.data.payload.parsed_data = output;
        db.matches.update({
            match_id: output.match_id
        }, {
            $set: {
                parsed_data: output,
                parse_status: 2
            }
        }, function(err) {
            cb(err, job);
        });
    });
}

function processApi(job, cb) {
    //process an api request
    var payload = job.data.payload;
    getData(job.data.url, function(err, data) {
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
    processParseStream: processParseStream,
    processApi: processApi
};