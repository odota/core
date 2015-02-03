var utility = require('./utility');
var retrievers = (process.env.RETRIEVER_HOST || "http://localhost:5100").split(",");
var async = require('async');
var db = utility.db;
var logger = utility.logger;
var fs = require('fs');
var moment = require('moment');
var getData = utility.getData;
var request = require('request');
var insertPlayer = utility.insertPlayer;
var insertMatch = utility.insertMatch;
var queueReq = utility.queueReq;
var spawn = require('child_process').spawn;
var replay_dir = process.env.REPLAY_DIR || "./replays/";
var domain = require('domain');

function processParse(job, cb) {
    var match_id = job.data.payload.match_id;
    var noRetry = job.toJSON().attempts.remaining <= 0;
    async.waterfall([
        async.apply(checkLocal, job),
        getReplayUrl,
        streamReplay,
    ], function(err, job2) {
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
            //todo do private/local lobbies have an id?  
            //todo data won't get inserted if uploaded replay where match id=0, or match not available in api
            if (job2 && job2.data.payload.match_id) {
                //queue job for api to make sure it's in db
                queueReq("api_details", job2.data.payload, function(err) {
                    cb(err);
                });
            }
            else {
                return cb(err);
            }
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
    var t1 = new Date();
    //var fileName = replay_dir + match_id + ".dem";
    //var archiveName = fileName + ".bz2";
    var match_id = job.data.payload.match_id;
    logger.info("[PARSER] streaming from %s", job.data.url || job.data.fileName);
    var d = domain.create();
    d.on('error', function(err) {
        logger.info(err);
        return cb(err);
    });
    d.run(function() {
        var parser_file = "parser/target/stats-0.1.0.jar";
        var output = "";
        var parser = spawn("java", ["-jar",
            parser_file
        ]);
        parser.stdout.on('data', function(data) {
            output += data;
        });
        parser.on('exit', function(code) {
            logger.info("[PARSER] exit code: %s", code);
            logger.info("[PARSER] parse time: %s", (new Date() - t1) / 1000);
            if (code) {
                return cb(code);
            }
            try {
                output = JSON.parse(output);
            }
            catch (err) {
                return cb(err);
            }
            if (job.data.fileName) {
                fs.unlinkSync(job.data.fileName);
            }
            match_id = match_id || output.match_id;
            job.data.payload.parsed_data = output;
            //todo get api data out of replay in case of private
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
        if (job.data.fileName) {
            fs.createReadStream(job.data.fileName).pipe(parser.stdin);
        }
        else {
            var bz = spawn("bzcat");
            var downStream = request.get({
                url: job.data.url,
                encoding: null
            });
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