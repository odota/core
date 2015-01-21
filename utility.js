var utility = exports,
    async = require('async'),
    spawn = require('child_process').spawn,
    BigNumber = require('big-number').n,
    request = require('request'),
    redis = require('redis'),
    winston = require('winston'),
    parseRedisUrl = require('parse-redis-url')(redis);
var options = parseRedisUrl.parse(process.env.REDIS_URL || "redis://127.0.0.1:6379");
options.auth = options.password;

utility.logger = new(winston.Logger)({
    transports: [new(winston.transports.Console)({
            'timestamp': true
        }),
        new(winston.transports.File)({
            filename: 'yasp.log',
            level: 'info'
        })
    ]
});
utility.redis = redis.createClient(options.port, options.host, {
    auth_pass: options.password
});
utility.kue = require('kue');
utility.jobs = utility.kue.createQueue({
    redis: options
});
utility.jobs.promote();
utility.db = require('monk')(process.env.MONGO_URL || "mongodb://localhost/dota");
utility.matches = utility.db.get('matches');
utility.matches.index('match_id', {
    unique: true
});
utility.players = utility.db.get('players');
utility.players.index('account_id', {
    unique: true
});
utility.constants = utility.db.get('constants');

utility.clearActiveJobs = function(type, cb) {
    utility.kue.Job.rangeByType(type, 'active', 0, 999999999, 'ASC', function(err, docs) {
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
};

//given an array of player ids, join with data from players collection
utility.fillPlayerNames = function(players, cb) {
    async.mapSeries(players, function(player, cb) {
        utility.players.findOne({
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
utility.getMatches = function(account_id, cb) {
    var search = {
        duration: {
            $exists: true
        }
    };
    if (account_id) {
        search.players = {
            $elemMatch: {
                account_id: account_id
            }
        };
    }
    utility.matches.find(search, {
        sort: {
            match_id: -1
        }
    }, function(err, docs) {
        cb(err, docs);
    });
};

/*
 * Makes search from a datatables call
 */
utility.makeSearch = function(search, columns) {
    var s = {};
    columns.forEach(function(c) {
        s[c.data] = "/.*" + search + ".*/";
    });

    return s;
};

/*
 * Makes sort from a datatables call
 */
utility.makeSort = function(order, columns) {
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
utility.convert64to32 = function(id) {
    return BigNumber(id).minus('76561197960265728');
};
/*
 * Converts a steamid 64 to a steamid 32
 *
 * Returns a BigNumber
 */
utility.convert32to64 = function(id) {
    return BigNumber('76561197960265728').plus(id);
};
utility.isRadiant = function(player) {
    return player.player_slot < 64;
};
utility.api_url = "https://api.steampowered.com/IDOTA2Match_570";
utility.summaries_url = "http://api.steampowered.com/ISteamUser";
utility.queueReq = function queueReq(type, payload, cb) {
    utility.checkDuplicate(payload, function(err) {
        if (err) {
            return cb(err);
        }
        var job = utility.generateJob(type, payload);
        var kuejob = utility.jobs.create(job.type, job).attempts(10).backoff({
            delay: 60000,
            type: 'exponential'
        }).removeOnComplete(true).save(function(err) {
            logger.info("[KUE] created jobid: %s", kuejob.id);
            cb(err, kuejob.id);
        });
    });
};

utility.checkDuplicate = function checkDuplicate(payload, cb) {
    if (payload.match_id) {
        utility.matches.findOne({
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
};

utility.generateJob = function(type, payload) {
    var api_url = utility.api_url;
    var summaries_url = utility.summaries_url;
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
            steamids.push(utility.convert32to64(player.account_id).toString());
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
};

utility.runParse = function runParse(fileName, cb) {
    logger.info("[PARSER] running parse on %s", fileName);
    var parser_file = "parser/target/stats-0.1.0.jar";
    var output = "";
    var cp = spawn("java", ["-jar",
        "-Xms128m",
        "-Xmx128m",
        parser_file,
        fileName
    ]);
    cp.stdout.on('data', function(data) {
        output += data;
    });
    cp.on('exit', function(code) {
        logger.info("[PARSER] parse complete on %s, exitcode: %s", fileName, code);
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
};

utility.getData = function getData(url, cb) {
    if (typeof url === "object") {
        var t = new Date().getTime();
        url = url[t % url.length];
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
};

utility.updateSummaries = function(cb) {
    utility.players.find({
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
                utility.queueReq("api_summaries", summaries, function(err) {
                    if (err) {
                        logger.info(err);
                    }
                });
                arr = [];
            }
        });
        cb(err);
    });
};


utility.getCurrentSeqNum = function getCurrentSeqNum(cb) {
    utility.getData(utility.api_url + "/GetMatchHistory/V001/?key=" + process.env.STEAM_API_KEY, function(err, data) {
        if (err) {
            console.log(err);
        }
        cb(data.result.matches[0].match_seq_num);
    });
};