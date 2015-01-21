var async = require('async'),
    spawn = require('child_process').spawn,
    BigNumber = require('big-number').n,
    request = require('request'),
    redis = require('redis'),
    winston = require('winston'),
    fs = require('fs'),
    moment = require('moment'),
    AWS = require('aws-sdk'),
    stream = require('stream'),
    db = require('./db'),
    parseRedisUrl = require('parse-redis-url')(redis),
    compressjs = require('compressjs');
var bz2 = compressjs.bzip2;
var retrievers = process.env.RETRIEVER_HOST.split(",");
var replay_dir = "replays/";
var api_url = "https://api.steampowered.com/IDOTA2Match_570";
var summaries_url = "http://api.steampowered.com/ISteamUser";
var options = parseRedisUrl.parse(process.env.REDIS_URL || "redis://127.0.0.1:6379");
options.auth = options.password;
var redisclient = redis.createClient(options.port, options.host, {
    auth_pass: options.password
});
var kue = require('kue');
var jobs = kue.createQueue({
    redis: options
});
jobs.promote();
var logger = new(winston.Logger)({
    transports: [new(winston.transports.Console)({
            'timestamp': true
        }),
        new(winston.transports.File)({
            filename: 'yasp.log',
            level: 'info'
        })
    ]
});

var clearActiveJobs = function(type, cb) {
    kue.Job.rangeByType(type, 'active', 0, 999999999, 'ASC', function(err, docs) {
        if (err) {
            return cb(err);
        }
        async.mapSeries(docs,
            function(job, cb) {
                job.state('inactive', function(err) {
                    logger.info('[KUE] Unstuck %s ', job.data.title);
                    cb(err);
                });
            },
            function(err) {
                cb(err);
            });
    });
}

var fillPlayerNames = function(players, cb) {
    async.mapSeries(players, function(player, cb) {
        db.players.findOne({
            account_id: player.account_id
        }, function(err, dbPlayer) {
            if (dbPlayer) {
                for (var prop in dbPlayer) {
                    player[prop] = dbPlayer[prop];
                }
            }
            cb(err);
        });
    }, function(err) {
        cb(err);
    });
};

var getMatches = function(account_id, cb) {
    var search = {};
    if (account_id) {
        search.players = {
            $elemMatch: {
                account_id: account_id
            }
        };
    }
    db.matches.find(search, {
        sort: {
            match_id: -1
        }
    }, function(err, docs) {
        cb(err, docs);
    });
}

/*
 * Makes search from a datatables call
 */
var makeSearch = function(search, columns) {
        var s = {};
        columns.forEach(function(c) {
            s[c.data] = "/.*" + search + ".*/";
        });
        return s;
    }
    /*
     * Makes sort from a datatables call
     */
var makeSort = function(order, columns) {
    var sort = {};
    order.forEach(function(s) {
        var c = columns[Number(s.column)];
        if (c) {
            sort[c.data] = s.dir === 'desc' ? -1 : 1;
        }
    });
    return sort;
};
/*
 * Converts a steamid 64 to a steamid 32
 *
 * Returns a BigNumber
 */
var convert64to32 = function(id) {
    return BigNumber(id).minus('76561197960265728');
};
/*
 * Converts a steamid 64 to a steamid 32
 *
 * Returns a BigNumber
 */
var convert32to64 = function(id) {
    return BigNumber('76561197960265728').plus(id);
};
var isRadiant = function(player) {
    return player.player_slot < 64;
};

var queueReq = function queueReq(type, payload, cb) {
    db.checkDuplicate(payload, function(err) {
        if (err) {
            return cb(err);
        }
        var job = generateJob(type, payload);
        var kuejob = jobs.create(job.type, job).attempts(10).backoff({
            delay: 60000,
            type: 'exponential'
        }).removeOnComplete(true).save(function(err) {
            logger.info("[KUE] created jobid: %s", kuejob.id);
            cb(err, kuejob.id);
        });
    });
}
var checkDuplicate = function checkDuplicate(payload, cb) {
    if (payload.match_id) {
        db.matches.findOne({
            match_id: payload.match_id
        }, function(err, doc) {
            if (!err && !doc) {
                cb(null);
            }
            cb("duplicate found");
        });
    }
    else {
        cb(null);
    }
}
var generateJob = function(type, payload) {
    if (type === "api_details") {
        return {
            url: api_url + "/GetMatchDetails/V001/?key=" + process.env.STEAM_API_KEY + "&match_id=" + payload.match_id,
            title: [type, payload.match_id].join(),
            type: "api",
            payload: payload
        };
    }
    if (type === "api_history") {
        return {
            url: api_url + "/GetMatchHistory/V001/?key=" + process.env.STEAM_API_KEY + "&account_id=" + payload.account_id + "&matches_requested=10",
            title: [type, payload.account_id].join(),
            type: "api",
            payload: payload
        };
    }
    if (type === "api_summaries") {
        var steamids = [];
        payload.players.forEach(function(player) {
            steamids.push(convert32to64(player.account_id).toString());
        });
        payload.query = steamids.join();
        return {
            url: summaries_url + "/GetPlayerSummaries/v0002/?key=" + process.env.STEAM_API_KEY + "&steamids=" + payload.query,
            title: [type, payload.summaries_id].join(),
            type: "api",
            payload: payload
        };
    }
    if (type === "upload") {
        return {
            type: type,
            title: [type, payload.fileName].join(),
            payload: payload
        };
    }
    if (type === "parse") {
        return {
            title: [type, payload.match_id].join(),
            type: type,
            payload: {
                match_id: payload.match_id,
                start_time: payload.start_time
            }
        };
    }
    else {
        logger.info("unknown type for generateJob");
    }
}
var runParse = function runParse(input, cb) {
    //if string, read the file into a stream
    if (typeof input === "string") {
        input = fs.createReadStream(input);
    }
    var parser_file = "parser/target/stats-0.1.0.jar";
    var output = "";
    var cp = spawn("java", ["-jar",
        "-Xms128m",
        "-Xmx128m",
        parser_file
    ]);
    input.pipe(cp.stdin);
    cp.stdout.on('data', function(data) {
        output += data;
    });
    cp.on('exit', function(code) {
        logger.info("[PARSER] exit code: %s", code);
        try {
            output = JSON.parse(output);
            return cb(code, output);
        }
        catch (e) {
            //error parsing json output
            logger.info(e);
            return cb(e);
        }
    });
}

var getData = function getData(url, cb) {
    setTimeout(function() {
        if (typeof url === "object") {
            url = url[Math.floor(Math.random() * url.length)];
        }
        request({
            url: url,
            json: true
        }, function(err, res, body) {
            logger.info("%s", url);
            if (err || res.statusCode !== 200 || !body) {
                logger.info("retrying getData: %s, %s, %s", err, res.statusCode, url);
                return setTimeout(function() {
                    getData(url, cb);
                }, 1000);
            }
            if (body.result) {
                //steam api response
                if (body.result.status === 15 || body.result.error === "Practice matches are not available via GetMatchDetails") {
                    //user does not have stats enabled or attempting to get private match, don't retry
                    logger.info(body);
                    return cb(body);
                }
                else if (body.result.error || body.result.status === 2) {
                    //valid response, but invalid data, retry
                    logger.info("retrying getData: %s, %s, %s", err, res.statusCode, url);
                    return setTimeout(function() {
                        getData(url, cb);
                    }, 1000);
                }
            }
            //generic valid response
            cb(null, body);
        });
    }, 1000);
}

var updateSummaries = function(cb) {
    db.players.find({
        personaname: {
            $exists: false
        }
    }, function(err, docs) {
        if (err) {
            return cb(err);
        }
        var arr = [];
        docs.forEach(function(player, i) {
            logger.info(player);
            arr.push(player);
            if (arr.length >= 100 || i >= docs.length) {
                var summaries = {
                    summaries_id: new Date(),
                    players: arr
                };
                queueReq("api_summaries", summaries, function(err) {
                    if (err) {
                        logger.info(err);
                    }
                });
                arr = [];
            }
        });
        cb(err);
    });
}
var getCurrentSeqNum = function getCurrentSeqNum(cb) {
    getData(api_url + "/GetMatchHistory/V001/?key=" + process.env.STEAM_API_KEY, function(err, data) {
        if (err) {
            console.log(err);
        }
        cb(data.result.matches[0].match_seq_num);
    });
}
var parseReplayFile = function parseReplayFile(job, cb) {
    async.waterfall([
        async.apply(checkLocal, job),
        getReplayUrl,
        downloadReplay,
        parseFile,
        insertParse,
    ], function(err) {
        handleErrors(err, job, function(err) {
            cb(err);
        });
    });
}
var parseReplayUrl = function parseReplayUrl(job, cb) {
    async.waterfall([
        async.apply(getReplayUrl, job),
        parseStream,
        insertParse,
    ], function(err) {
        handleErrors(err, job, function(err) {
            cb(err);
        });
    });
}

var getReplayUrl = function getReplayUrl(job, cb) {
    if (job.data.url || job.data.fileName) {
        return cb(null, job, job.data.url);
    }
    var match = job.data.payload;
    if (match.start_time > moment().subtract(7, 'days').format('X')) {
        var urls = [];
        for (var i = 0; i < retrievers.length; i++) {
            urls[i] = retrievers[i] + "?match_id=" + job.data.payload.match_id;
        }
        getData(urls, function(err, body) {
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

var downloadReplay = function (job, url, cb) {
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

var decompress = function decompress(comp, fileName, cb) {
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

var parseFile = function parseFile(job, fileName, cb) {
    var match_id = job.data.payload.match_id;
    var t3 = new Date().getTime();
    runParse(fileName, function(err, output) {
        if (err) {
            return cb(err);
        }
        var t4 = new Date().getTime();
        logger.info("[PARSER] %s, parse time: %s", match_id, (t4 - t3) / 1000);
        cb(err, output);
    });
}

var parseStream = function parseStream(job, url, cb) {
    var match_id = job.data.payload.match_id;
    var t3 = new Date().getTime();
    var ws = stream.Writable();
    var rs = stream.Readable();
    ws.pipe(rs);
    bz2.decompress(request
        .get({
            url: url,
            encoding: null
        })
        .on('error', function(err) {
            return cb(err);
        }), ws);
    runParse(rs, function(err, output) {
        if (err) {
            return cb(err);
        }
        var t4 = new Date().getTime();
        logger.info("[PARSER] %s, parse time: %s", match_id, (t4 - t3) / 1000);
        cb(err, output);
    });
}

var handleErrors = function handleErrors(err, job, cb) {
    var match_id = job.data.payload.match_id;
    if (err) {
        logger.info("[PARSER] error on match %s: %s", match_id, err);
        if (job.attempts.remaining === 0 || err === "S3 UNAVAILABLE") {
            //don't retry
            db.matches.update({
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
    if (process.env.DELETE_REPLAYS) {
        fs.unlink(job.data.fileName, function(err) {
            logger.info(err);
        });
    }
    cb(err);
}

var getS3URL = function getS3URL(match_id, cb) {
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

var uploadToS3 = function uploadToS3(archiveName, body, cb) {
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

var insertParse = function insertParse(output, cb) {
    db.matches.update({
        match_id: output.match_id
    }, {
        $set: {
            parsed_data: output,
            parse_status: 2
        }
    }, function(err) {
        cb(err);
    });
}

module.exports = {
    redis: redisclient,
    logger: logger,
    kue: kue,
    jobs: jobs,
    clearActiveJobs: clearActiveJobs,
    fillPlayerNames: fillPlayerNames,
    getMatches: getMatches,
    makeSearch: makeSearch,
    makeSort: makeSort,
    convert32to64: convert32to64,
    convert64to32: convert64to32,
    isRadiant: isRadiant,
    queueReq: queueReq,
    checkDuplicate: checkDuplicate,
    generateJob: generateJob,
    runParse: runParse,
    getData: getData,
    updateSummaries: updateSummaries,
    getCurrentSeqNum: getCurrentSeqNum,
    parseReplayFile: parseReplayFile,
    parseReplayUrl: parseReplayUrl,
    getReplayUrl: getReplayUrl,
    downloadReplay: downloadReplay,
    decompress: decompress,
    parseFile: parseFile,
    parseStream: parseStream,
    handleErrors: handleErrors,
    getS3URL: getS3URL,
    uploadToS3: uploadToS3
};