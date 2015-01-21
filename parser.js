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
        async.apply(checkLocal, job),
        getReplayUrl,
        download,
        parseFile,
        utility.insertParse,
    ], function(err) {
        handleErrors(err, job, function(err) {
            cb(err);
        });
    });
}

function parseReplayStream(job, cb) {
    async.waterfall([
        async.apply(getReplayUrl, job),
        parseStream,
        utility.insertParse,
    ], function(err) {
        handleErrors(err, job, function(err) {
            cb(err);
        });
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
        cb(err, output);
    });
}

function parseStream(job, url, cb) {
    //todo stream download, decompress, and parse
    //todo need to modify parser to support streaming input
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