var utility = exports,
    fs = require('fs'),
    async = require('async'),
    spawn = require('child_process').spawn,
    BigNumber = require('big-number').n,
    request = require('request'),
    winston = require('winston');
var transports = [new(winston.transports.Console)(),
    new(winston.transports.File)({
        filename: 'utility.log',
        level: 'info'
    })
]
var logger = new(winston.Logger)({
    transports: transports
});
utility.redis = require('redis').createClient(process.env.REDIS_PORT || 6379, process.env.REDIS_HOST || '127.0.0.1', {});
utility.kue = require('kue');
utility.jobs = utility.kue.createQueue({
    redis: {
        port: process.env.REDIS_PORT || 6379,
        host: process.env.REDIS_HOST || '127.0.0.1'
    }
})
utility.jobs.promote();
utility.db = require('monk')(process.env.MONGOHQ_URL || "mongodb://localhost/dota");
utility.matches = utility.db.get('matches');
utility.matches.index('match_id', {
    unique: true
});
utility.players = utility.db.get('players');
utility.players.index('account_id', {
    unique: true
})
utility.constants = utility.db.get('constants');

utility.clearActiveJobs = function(type, cb) {
    utility.kue.Job.rangeByType(type, 'active', 0, 99999, 'ASC', function(err, docs) {
        async.mapSeries(docs,
            function(job, cb) {
                job.state('inactive', function(err) {
                    logger.info('[KUE] Unstuck %s ', job.data.title);
                    cb(err)
                })
            },
            function(err) {
                cb(err)
            })
    })
}

//given an array of player ids, join with data from players collection
utility.fillPlayerNames = function(players, cb) {
    async.mapSeries(players, function(player, cb) {
        utility.players.findOne({
            account_id: player.account_id
        }, function(err, dbPlayer) {
            if (dbPlayer) {
                for (var prop in dbPlayer) {
                    player[prop] = dbPlayer[prop]
                }
            }
            cb(null)
        })
    }, function(err) {
        cb(err)
    })
}
utility.getMatches = function(account_id, cb) {
    var search = {
        duration: {
            $exists: true
        }
    }
    if (account_id) {
        search.players = {
            $elemMatch: {
                account_id: account_id
            }
        }
    }
    utility.matches.find(search, {
        sort: {
            match_id: -1
        }
    }, function(err, docs) {
        cb(err, docs)
    })
}

/*
 * Makes search from a datatables call
 */
utility.makeSearch = function(search, columns) {
    var s = {}
    columns.forEach(function(c) {
        s[c.data] = "/.*" + search + ".*/"
    })

    return s;
}

/*
 * Makes sort from a datatables call
 */
utility.makeSort = function(order, columns) {
    var sort = {}
    order.forEach(function(s) {
        var c = columns[Number(s.column)]
        if (c) {
            sort[c.data] = s.dir === 'desc' ? -1 : 1
        }
    })

    return sort;
}

/*
 * Converts a steamid 64 to a steamid 32
 *
 * Returns a BigNumber
 */
utility.convert64to32 = function(id) {
        return BigNumber(id).minus('76561197960265728')
    }
    /*
     * Converts a steamid 64 to a steamid 32
     *
     * Returns a BigNumber
     */
utility.convert32to64 = function(id) {
    return BigNumber('76561197960265728').plus(id)
}
utility.isRadiant = function(player) {
    return player.player_slot < 64
}
utility.api_url = "https://api.steampowered.com/IDOTA2Match_570";
utility.summaries_url = "http://api.steampowered.com/ISteamUser";
utility.queueReq = function queueReq(type, payload, cb) {
    var job = utility.generateJob(type, payload);
    var kuejob = utility.jobs.create(job.type, job).attempts(10).backoff({
        delay: 60000,
        type: 'exponential'
    }).removeOnComplete(true).save(function(err) {
        if (err) {
            logger.info(err);
        }
        else {
            logger.info("[KUE] created jobid: %s", kuejob.id);
        }
        if (cb) {
            cb(err, kuejob.id)
        }
    });
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
        }
    }
    if (type === "api_history") {
        return {
            url: api_url + "/GetMatchHistory/V001/?key=" + process.env.STEAM_API_KEY + "&account_id=" + payload.account_id + "&matches_requested=10",
            title: [type, payload.account_id].join(),
            type: "api",
            payload: payload
        }
    }
    if (type === "api_summaries") {
        return {
            url: summaries_url + "/GetPlayerSummaries/v0002/?key=" + process.env.STEAM_API_KEY + "&steamids=" + payload.query,
            title: [type, payload.summaries_id].join(),
            type: "api",
            payload: payload
        }
    }
    if (type === "upload") {
        return {
            type: type,
            title: [type, payload.fileName].join(),
            payload: payload
        }
    }
    if (type === "parse") {
        return {
            title: [type, payload.match_id].join(),
            type: type,
            payload: {
                match_id: payload.match_id,
                start_time: payload.start_time
            }
        }
    }
    else {
        logger.info("unknown type for generateJob");
    }
}

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
    request({
        url: url,
        json: true
    }, function(err, res, body) {
        //logger.info("%s", url)
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

utility.requestDetails = function requestDetails(match, cb) {
    utility.matches.findOne({
        match_id: match.match_id
    }, function(err, doc) {
        if (!doc) {
            utility.queueReq("api", match);
        }
        cb(null);
    });
};

utility.getCurrentSeqNum = function getCurrentSeqNum(cb) {
    utility.getData(utility.api_url + "/GetMatchHistory/V001/?key=" + process.env.STEAM_API_KEY, function(err, data) {
        if (err) {
            console.log(err);
        }
        cb(data.result.matches[0].match_seq_num);
    })
}