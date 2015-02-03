var BigNumber = require('big-number').n,
    request = require('request'),
    winston = require('winston'),
    redis = require('redis'),
    moment = require('moment'),
    parseRedisUrl = require('parse-redis-url')(redis);
var spawn = require("child_process").spawn;

var options = parseRedisUrl.parse(process.env.REDIS_URL || "redis://127.0.0.1:6379/0");
//set keys for kue
options.auth = options.password;
options.db = options.database;
var kue = require('kue');
var db = require('monk')(process.env.MONGO_URL || "mongodb://localhost/dota");
db.get('matches').index('match_id', {
    unique: true
});
db.get('matches').index('players.account_id');
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
    return new BigNumber(id).minus('76561197960265728');
}

/*
 * Converts a steamid 64 to a steamid 32
 *
 * Returns a BigNumber
 */
function convert32to64(id) {
    return new BigNumber('76561197960265728').plus(id);
}

/*
 * Makes search from a datatables call
 */
function makeSearch(search, columns) {
    //todo operate on passed data to filter
    var s = {};
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
    checkDuplicate(type, payload, function(err, doc) {
        if (err) {
            return cb(err);
        }
        if (doc) {
            logger.info("match already in db");
            return cb(null);
        }
        var job = generateJob(type, payload);
        var kuejob = jobs.create(job.type, job).attempts(10).backoff({
            delay: 60 * 1000,
            type: 'exponential'
        }).removeOnComplete(true).priority(payload.priority || 'normal').save(function(err) {
            logger.info("[KUE] created jobid: %s", kuejob.id);
            cb(err, kuejob);
        });
    });
}

function checkDuplicate(type, payload, cb) {
    if (type === "api_details" && payload.match_id) {
        //make sure match doesn't exist already in db before queueing for api
        db.matches.findOne({
            match_id: payload.match_id
        }, function(err, doc) {
            cb(err, doc);
        });
    }
    else {
        //no duplicate check for anything else
        cb(null);
    }
}

function generateJob(type, payload) {
    var api_url = "http://api.steampowered.com";
    if (type === "api_details") {
        return {
            url: api_url + "/IDOTA2Match_570/GetMatchDetails/V001/?key=" + process.env.STEAM_API_KEY + "&match_id=" + payload.match_id,
            title: [type, payload.match_id].join(),
            type: "api",
            payload: payload
        };
    }
    if (type === "api_history") {
        var url = api_url + "/IDOTA2Match_570/GetMatchHistory/V001/?key=" + process.env.STEAM_API_KEY;
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
            url: api_url + "/ISteamUser/GetPlayerSummaries/v0002/?key=" + process.env.STEAM_API_KEY + "&steamids=" + payload.query,
            title: [type, payload.summaries_id].join(),
            type: "api",
            payload: payload
        };
    }
    if (type === "api_sequence") {
        return {
            url: api_url + "/IDOTA2Match_570/GetMatchHistoryBySequenceNum/V001/?key=" + process.env.STEAM_API_KEY + "&start_at_match_seq_num=" + payload.seq_num,
            title: [type, payload.seq_num].join(),
            type: "api",
            payload: payload
        };
    }
    if (type === "api_heroes") {
        return {
            url: api_url + "/IEconDOTA2_570/GetHeroes/v0001/?key=" + process.env.STEAM_API_KEY + "&language=" + payload.language,
            title: [type, payload.language].join(),
            type: "api",
            payload: payload
        };
    }
    if (type === "parse") {
        return {
            title: [type, payload.match_id].join(),
            type: type,
            fileName: payload.fileName,
            uploader: payload.uploader,
            payload: payload
        };
    }
}

function getData(url, cb) {
        setTimeout(function() {
            var target = url;
            //array given, pick one randomly
            if (typeof url === "object") {
                target = url[Math.floor(Math.random() * url.length)];
            }
            request({
                url: target,
                json: true
            }, function(err, res, body) {
                if (err || res.statusCode !== 200 || !body) {
                    logger.info("retrying: %s", target);
                    return getData(url, cb);
                }
                logger.info("got data: %s", target);
                if (body.result) {
                    //steam api response
                    if (body.result.status === 15 || body.result.error === "Practice matches are not available via GetMatchDetails" || body.result.error === "No Match ID specified") {
                        //user does not have stats enabled or attempting to get private match/invalid id, don't retry
                        logger.info(body);
                        return cb(body);
                    }
                    else if (body.result.error || body.result.status === 2) {
                        //valid response, but invalid data, retry
                        logger.info("invalid data: %s, %s", target, JSON.stringify(body));
                        return getData(url, cb);
                    }
                }
                //generic valid response
                return cb(null, body);
            });
        }, 800);
    }
    /*
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
    */
function insertMatch(match, cb) {
    match.parse_status = match.parsed_data ? 2 : 0;
    db.matches.update({
            match_id: match.match_id
        }, {
            $set: match
        }, {
            upsert: true
        },
        function(err) {
            if (!match.parse_status) {
                queueReq("parse", match, function(err) {
                    cb(err);
                });
            }
            else {
                cb(err);
            }
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

function fullHistoryEligible() {
    return {
        track: 1,
        full_history: {
            $lt: 2
        },
        join_date: {
            $lt: moment().subtract(10, 'day').toDate()
        }
    };
}

function runParse(cb) {
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
        if (code) {
            return cb(code);
        }
        try {
            output = JSON.parse(output);
            cb(null, output);
        }
        catch (err) {
            cb(err);
        }
    });
    return parser;
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
    fullHistoryEligible: fullHistoryEligible,
    insertPlayer: insertPlayer,
    insertMatch: insertMatch,
    runParse: runParse
};
