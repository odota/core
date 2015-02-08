var BigNumber = require('big-number').n,
    request = require('request'),
    winston = require('winston'),
    redis = require('redis'),
    parseRedisUrl = require('parse-redis-url')(redis);
var spawn = require("child_process").spawn;
var api_url = "http://api.steampowered.com";
var api_keys = process.env.STEAM_API_KEY.split(",");
var retrievers = (process.env.RETRIEVER_HOST || "http://localhost:5100").split(",");
var urllib = require('url');

var options = parseRedisUrl.parse(process.env.REDIS_URL || "redis://127.0.0.1:6379/0");
//set keys for kue
options.auth = options.password;
options.db = options.database;
var kue = require('kue');
var db = require('./db');
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

function isRadiant(player) {
    return player.player_slot < 64;
}

function queueReq(type, payload, cb) {
    checkDuplicate(type, payload, function(err, doc) {
        if (err) {
            return cb(err);
        }
        if (doc) {
            console.log("match already in db");
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
    var api_key;
    var opts = {
        "api_details": function() {
            return {
                url: api_url + "/IDOTA2Match_570/GetMatchDetails/V001/?key=" + api_key + "&match_id=" + payload.match_id,
                title: [type, payload.match_id].join(),
                type: "api",
                payload: payload
            };
        },
        "api_history": function() {
            return {
                url: api_url + "/IDOTA2Match_570/GetMatchHistory/V001/?key=" + api_key + (payload.account_id ? "&account_id=" + payload.account_id : "") + (payload.matches_requested ? "&matches_requested=" + payload.matches_requested : "") + (payload.hero_id ? "&hero_id=" + payload.hero_id : ""),
                title: [type, payload.account_id].join(),
                type: "api",
                payload: payload
            };
        },
        "api_summaries": function() {
            return {
                url: api_url + "/ISteamUser/GetPlayerSummaries/v0002/?key=" + api_key + "&steamids=" + payload.players.map(function(p) {
                    return convert32to64(p.account_id).toString();
                }).join(),
                title: [type, payload.summaries_id].join(),
                type: "api",
                payload: payload
            };
        },
        "api_sequence": function() {
            return {
                url: api_url + "/IDOTA2Match_570/GetMatchHistoryBySequenceNum/V001/?key=" + api_key + "&start_at_match_seq_num=" + payload.start_at_match_seq_num,
                title: [type, payload.seq_num].join(),
                type: "api"
            };
        },
        "api_heroes": function() {
            return {
                url: api_url + "/IEconDOTA2_570/GetHeroes/v0001/?key=" + api_key + "&language=" + payload.language,
                title: [type, payload.language].join(),
                type: "api",
                payload: payload
            };
        },
        "parse": function() {
            return {
                title: [type, payload.match_id].join(),
                type: type,
                fileName: payload.fileName,
                payload: payload
            };
        }
    };
    return opts[type]();
}

function getData(url, cb) {
    var delay = 1000;
    var parse = urllib.parse(url, true);
    //inject a random retriever
    if (parse.host === "retriever") {
        //todo inject a retriever key
        parse.host = retrievers[Math.floor(Math.random() * retrievers.length)];
    }
    //inject a random key if steam api request
    if (parse.host === "api.steampowered.com") {
        parse.query.key = api_keys[Math.floor(Math.random() * api_keys.length)];
        parse.search = null;
        delay = 1000 / api_keys.length;
    }
    var target = urllib.format(parse);
    logger.info("getData: %s", target);
    request({
        url: target,
        json: true,
        timeout: 15000
    }, function(err, res, body) {
        if (err || res.statusCode !== 200 || !body) {
            logger.info("retrying: %s", target);
            return setTimeout(function() {
                getData(url, cb);
            }, delay);
        }
        if (body.result) {
            //steam api response
            if (body.result.status === 15 || body.result.error === "Practice matches are not available via GetMatchDetails" || body.result.error === "No Match ID specified") {
                //user does not have stats enabled or attempting to get private match/invalid id, don't retry
                return setTimeout(function() {
                    cb(body);
                }, delay);
            }
            else if (body.result.error || body.result.status === 2) {
                //valid response, but invalid data, retry
                logger.info("invalid data: %s, %s", target, JSON.stringify(body));
                return setTimeout(function() {
                    getData(url, cb);
                }, delay);
            }
        }
        return setTimeout(function() {
            cb(null, body);
        }, delay);
    });
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
            cb(code, output);
        }
        catch (err) {
            cb(err);
        }
    });
    return parser;
}

/*
 * Makes sort from a datatables call
 */
function makeSort(order, columns) {
    var sort = {};
    if (order && columns) {
        order.forEach(function(s) {
            var c = columns[Number(s.column)];
            if (c) {
                sort[c.data] = s.dir === 'desc' ? -1 : 1;
            }
        });
    }
    return sort;
}

module.exports = {
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
    runParse: runParse,
    makeSort: makeSort
};

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