var request = require("request"),
    fs = require("fs"),
    moment = require('moment'),
    Bunzip = require('seek-bzip'),
    utility = require('./utility'),
    matches = utility.matches,
    AWS = require('aws-sdk'),
    winston = require('winston');
var jobs = utility.jobs;
var replay_dir = "replays/";
var retrievers = process.env.RETRIEVER_HOST.split(",");
var transports = [new(winston.transports.Console)({
        'timestamp': true
    }),
    new(winston.transports.File)({
        filename: 'parser.log',
        level: 'info'
    })
];
var logger = new(winston.Logger)({
    transports: transports
});
utility.clearActiveJobs('parse', function(err) {
    if (err) {
        logger.info(err);
    }
    jobs.process('parse', 8, function(job, done) {
        parseReplay(job, done);
    });
});

function download(job, cb) {
    var match_id = job.data.payload.match_id;
    if (!fs.existsSync(replay_dir)) {
        fs.mkdir(replay_dir);
    }
    var fileName = replay_dir + match_id + ".dem";
    if (fs.existsSync(fileName)) {
        logger.info("[PARSER] %s, found local replay", match_id);
        cb(null, fileName);
    }
    else {
        getReplayUrl(job, function(err, url) {
            if (err) {
                return cb(err);
            }
            logger.info("[PARSER] downloading from %s", url);
            var t1 = new Date().getTime();
            request({
                url: url,
                encoding: null
            }, function(err, response, body) {
                if (err || response.statusCode !== 200) {
                    logger.info("[PARSER] failed to download from %s", url);
                    return cb("DOWNLOAD ERROR");
                }
                else {
                    var t2 = new Date().getTime();
                    logger.info("[PARSER] %s, dl time: %s", match_id, (t2 - t1) / 1000);
                    try {
                        var decomp = Bunzip.decode(body);
                        fs.writeFile(fileName, decomp, function(err) {
                            if (err) {
                                return cb(err);
                            }
                            var t3 = new Date().getTime();
                            logger.info("[PARSER] %s, decomp time: %s", match_id, (t3 - t2) / 1000);
                            var archiveName = match_id + ".dem.bz2";
                            uploadToS3(archiveName, body, function(err) {
                                return cb(err, fileName);
                            });
                        });
                    }
                    catch (e) {
                        return cb(e);
                    }
                }
            });
        });
    }
}


function getReplayUrl(job, cb) {
    if ('url' in job.data) {
        return cb(null, job.data.url);
    }
    var match = job.data.payload;
    if (match.start_time > moment().subtract(7, 'days').format('X')) {
        var urls = [];
        for (var i = 0; i < retrievers.length; i++) {
            urls[i] = retrievers[i] + "?match_id=" + job.data.payload.match_id;
        }
        utility.getData(urls, function(err, body) {
            if (err) {
                logger.info(err);
            }
            if (body && body.match) {
                var url = "http://replay" + body.match.cluster + ".valve.net/570/" + match.match_id + "_" + body.match.replaySalt + ".dem.bz2";
                job.data['url'] = url;
                job.update();
                return cb(null, url);
            }
            else {
                logger.info(body);
                return cb("response error");
            }
        });
    }
    else {
        getS3URL(match.match_id, function(err, url) {
            cb(err, url);
        });
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
        s3.headObject(params, function(err, data) {
            if (err) {
                params.Body = body;
                s3.putObject(params, function(err, data) {
                    if (err) {
                        logger.info('[S3] could not upload to S3');
                    }
                    else {
                        logger.info('[S3] Successfully uploaded replay to S3: %s ', archiveName);
                    }
                    cb(err);
                });
            }
            else {
                logger.info('[S3] replay already exists in S3');
                cb(err);
            }
        });
    }
    else {
        logger.info("[S3] S3 not defined (skipping upload)");
        cb(null);
    }
}

function parseReplay(job, cb) {
    var match_id = job.data.payload.match_id;
    matches.findOne({
        match_id: match_id
    }, function(err, doc) {
        if (!err && doc && doc.parsed_data) {
            //match already has parsed data
            cb(null);
        }
        else {
            download(job, function(err, fileName) {
                if (err) {
                    logger.info("[PARSER] Error for match %s: %s", match_id, err);
                    if (job.attempts.remaining === 0 || err === "S3 UNAVAILABLE") {
                        //don't retry
                        matches.update({
                            match_id: job.data.payload.match_id
                        }, {
                            $set: {
                                parse_status: 1
                            }
                        });
                        //todo this isn't optimal since this marks the job as complete, so it immediately disappears
                        return cb(null);
                    }
                    //retry
                    return cb(new Error(err));
                }
                var t1 = new Date().getTime();
                utility.runParse(fileName, function(err, output) {
                    var t2 = new Date().getTime();
                    logger.info("[PARSER] %s, parse time: %s", match_id, (t2 - t1) / 1000);
                    if (!err) {
                        if (process.env.DELETE_REPLAYS) {
                            fs.unlink(fileName, function(err) {
                                logger.info(err);
                            });
                        }
                        //process parser output
                        matches.update({
                            match_id: match_id
                        }, {
                            $set: {
                                parsed_data: output,
                                parse_status: 2
                            }
                        });
                    }
                    return cb(new Error(err));
                });
            });
        }
    });
}
