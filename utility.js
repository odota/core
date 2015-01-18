var utility = exports,
    fs = require('fs'),
    async = require('async'),
    spawn = require('child_process').spawn,
    reds = require('reds'),
    BigNumber = require('big-number').n;
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
                    console.log('[KUE] Unstuck %s ', job.data.title);
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

utility.queueReq = function(type, data) {
    var api_url = utility.api_url;
    var summaries_url = "http://api.steampowered.com/ISteamUser"
    var url;
    var name;
    if (type === "api") {
        if (data.match_id) {
            url = api_url + "/GetMatchDetails/V001/?key=" + process.env.STEAM_API_KEY + "&match_id=" + data.match_id;
            name = "details_" + data.match_id
        }
        else if (data.summaries_id) {
            url = summaries_url + "/GetPlayerSummaries/v0002/?key=" + process.env.STEAM_API_KEY + "&steamids=" + data.query
            name = "summaries_" + data.summaries_id
        }
        else if (data.account_id) {
            url = api_url + "/GetMatchHistory/V001/?key=" + process.env.STEAM_API_KEY + "&account_id=" + data.account_id + "&matches_requested=5"
            name = "history_" + data.account_id
        }
    }
    if (type === "parse") {
        name = "parse_" + data.match_id
        data = {
            match_id: data.match_id,
            start_time: data.start_time
        }
    }
    reds.createSearch(utility.jobs.client.getKey('search')).query(name).end(function(err, ids) {
        for (var i = 0; i < ids.length; i++) {
            utility.kue.Job.get(ids[i], function(err, job) {
                if (err) return;
                job.remove(function(err) {
                    if (err) throw err;
                    console.log('removed job #%d', job.id);
                });
            });
        }
        var job = {
            title: name,
            payload: data,
            url: url
        };
        console.log(job)
        utility.jobs.create(type, job).attempts(10).backoff({
            delay: 60000,
            type: 'exponential'
        }).searchKeys(['title']).removeOnComplete(true).save(function(err) {});
    })
}

utility.runParse = function runParse(fileName, cb) {
    var parser_file = "parser/target/stats-0.1.0.jar";
    console.log("[PARSER] running parse on %s", fileName)

    var output = ""
    var cp = spawn("java", ["-jar",
        "-Xms128m",
        "-Xmx128m",
        parser_file,
        fileName
    ])
    cp.stdout.on('data', function(data) {
        output += data
    })
    cp.stderr.on('data', function(data) {
        console.log('[PARSER] stderr: %s', data);
    })
    cp.on('exit', function(code) {
        console.log('[PARSER] exit code: %s', code);
        cb(code, output);
        if (process.env.DELETE_REPLAYS && !code) {
            fs.unlink(fileName)
        }
    })
}