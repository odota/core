var dotenv = require('dotenv');
dotenv.load();
var spawn = require('child_process').spawn,
    BigNumber = require('big-number').n,
    request = require('request'),
    winston = require('winston'),
    fs = require('fs'),
    util = require('util'),
    stream = require('stream'),
    AWS = require('aws-sdk'),
    redis = require('redis'),
    parseRedisUrl = require('parse-redis-url')(redis),
    streamifier = require('streamifier');
var moment = require('moment');
var numeral = require('numeral');
var api_url = "https://api.steampowered.com/IDOTA2Match_570";
var summaries_url = "http://api.steampowered.com/ISteamUser";
var options = parseRedisUrl.parse(process.env.REDIS_URL || "redis://127.0.0.1:6379");
options.auth = options.password; //set 'auth' key for kue
var kue = require('kue');
var db = require('monk')(process.env.MONGO_URL || "mongodb://localhost/dota");
db.get('matches').index('match_id', {
    unique: true
});
db.get('players').index('account_id', {
    unique: true
});
db.matches = db.get('matches');
db.players = db.get('players');
var redisclient = redis.createClient(options.port, options.host, {
    auth_pass: options.password
});
var jobs = kue.createQueue({
    redis: options
});
jobs.promote();
var transports = [];
if (process.env.NODE_ENV !== "test") {
    transports.push(new(winston.transports.Console)({
        'timestamp': true
    }));
}
var logger = new(winston.Logger)({
    transports: transports
});

/*
 * Converts a steamid 64 to a steamid 32
 *
 * Returns a BigNumber
 */
function convert64to32(id) {
    return BigNumber(id).minus('76561197960265728');
}

/*
 * Converts a steamid 64 to a steamid 32
 *
 * Returns a BigNumber
 */
function convert32to64(id) {
    return BigNumber('76561197960265728').plus(id);
}

/*
 * Makes search from a datatables call
 */
function makeSearch(search, columns) {
    var s = {};
    columns.forEach(function(c) {
        s[c.data] = "/.*" + search + ".*/";
    });
    return s;
}

/*
 * Makes sort from a datatables call
 */
function makeSort(order, columns) {
    var sort = {};
    order.forEach(function(s) {
        var c = columns[Number(s.column)];
        if (c) {
            sort[c.data] = s.dir === 'desc' ? -1 : 1;
        }
    });
    return sort;
}

function isRadiant(player) {
    return player.player_slot < 64;
}

function queueReq(type, payload, cb) {
    checkDuplicate(type, payload, function(err) {
        if (err) {
            logger.info(err);
            return cb(null);
        }
        var job = generateJob(type, payload);
        var kuejob = jobs.create(job.type, job).attempts(10).backoff({
            delay: 60000,
            type: 'exponential'
        }).removeOnComplete(true).priority(payload.priority || 'normal').save(function(err) {
            logger.info("[KUE] created jobid: %s", kuejob.id);
            cb(err, kuejob);
        });
    });
}

function checkDuplicate(type, payload, cb) {
    if (type === "api_details" && payload.match_id) {
        //make sure match doesn't exist already in db
        //parse requests are allowed to repeat
        db.matches.findOne({
            match_id: payload.match_id
        }, function(err, doc) {
            if (!err && !doc) {
                return cb(null);
            }
            cb(new Error("duplicate found"));
        });
    }
    else {
        //no duplicate check for anything else
        cb(null);
    }
}

function generateJob(type, payload) {
    if (type === "api_details") {
        return {
            url: api_url + "/GetMatchDetails/V001/?key=" + process.env.STEAM_API_KEY + "&match_id=" + payload.match_id,
            title: [type, payload.match_id].join(),
            type: "api",
            payload: payload
        };
    }
    if (type === "api_history") {
        var url = api_url + "/GetMatchHistory/V001/?key=" + process.env.STEAM_API_KEY;
        url += payload.account_id ? "&account_id=" + payload.account_id : "";
        url += payload.matches_requested ? "&matches_requested=" + payload.matches_requested : "";
        url += payload.hero_id ? "&hero_id=" + payload.hero_id : "";
        return {
            url: url,
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
    if (type === "api_sequence") {
        return {
            url: api_url + "/GetMatchHistoryBySequenceNum/V001/?key=" + process.env.STEAM_API_KEY + "&start_at_match_seq_num=" + payload.seq_num,
            title: [type, payload.match_id].join(),
            type: "api",
            payload: payload
        };
    }
    if (type === "parse") {
        return {
            title: [type, payload.match_id].join(),
            type: type,
            fileName: payload.fileName,
            payload: {
                match_id: payload.match_id,
                start_time: payload.start_time
            }
        };
    }
    else {
        logger.info("unknown type for generateJob");
        return null;
    }
}

function runParse(input, cb) {
    var parser_file = "parser/target/stats-0.1.0.jar";
    var output = "";
    var cp = spawn("java", ["-jar",
        parser_file
    ]);
    //if string, read the file into a stream
    if (typeof input === "string") {
        fs.createReadStream(input).pipe(cp.stdin);
    }
    else {
        streamifier.createReadStream(input).pipe(cp.stdin);
    }
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

function getData(url, cb) {
    setTimeout(function() {
        if (typeof url === "object") {
            url = url[Math.floor(Math.random() * url.length)];
        }
        request({
            url: url,
            json: true
        }, function(err, res, body) {
            if (err || res.statusCode !== 200 || !body) {
                logger.info("retrying getData: %s", url);
                return setTimeout(function() {
                    getData(url, cb);
                }, 1000);
            }
            logger.info("got data: %s", url);
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

function getS3Url(match_id, cb) {
    var archiveName = match_id + ".dem.bz2";
    var s3 = new AWS.S3();
    var params = {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: archiveName
    };
    var url;
    try {
        url = s3.getSignedUrl('getObject', params);
        cb(null, url);
    }
    catch (e) {
        logger.info("[S3] %s not in S3", match_id);
        cb(new Error("S3 UNAVAILABLE"));
    }
}

function uploadToS3(data, archiveName, cb) {
    var s3 = new AWS.S3();
    var params = {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: archiveName
    };
    params.Body = data;
    s3.putObject(params, function(err, data) {
        cb(err);
    });
}

function insertMatch(match, cb) {
    var summaries = {
        summaries_id: new Date(),
        players: match.players
    };
    //queue for player names
    queueReq("api_summaries", summaries, function(err) {
        if (err) {
            return logger.info(err);
        }
    });
    if (match.parsed_data) {
        match.parse_status = 2;
    }
    else {
        match.parse_status = 0;
        queueReq("parse", match, function(err) {
            if (err) {
                return logger.info(err);
            }
        });
    }
    db.matches.update({
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

function insertPlayer(player, cb) {
    var account_id = Number(convert64to32(player.steamid));
    player.last_summaries_update = new Date();
    db.players.update({
        account_id: account_id
    }, {
        $set: player
    }, {
        upsert: true
    }, function(err) {
        cb(err);
    });
}



function decompress(archiveName, cb) {
    var cp = spawn("bunzip2", [archiveName]);
    cp.on('exit', function(code) {
        logger.info("[BZIP2] exit code: %s", code);
        cb(code);
    });
}

module.exports = {
    //utilities
    db: db,
    redis: redisclient,
    logger: logger,
    kue: kue,
    jobs: jobs,
    convert32to64: convert32to64,
    convert64to32: convert64to32,
    isRadiant: isRadiant,
    generateJob: generateJob,
    getData: getData,
    queueReq: queueReq,
    makeSearch: makeSearch,
    makeSort: makeSort,

    //s3
    getS3Url: getS3Url,
    uploadToS3: uploadToS3,

    //insertion
    insertPlayer: insertPlayer,
    insertMatch: insertMatch,

    //parse
    runParse: runParse,
    decompress: decompress,
};