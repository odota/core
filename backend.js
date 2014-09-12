var request = require('request'),
    path = require("path"),
    fs = require("fs"),
    async = require("async"),
    Steam = require("./MatchProvider").MatchProvider,
    spawn = require('child_process').spawn,
    moment = require('moment'),
    Bunzip = require('seek-bzip'),
    utility = require('./utility'),
    matches = utility.matches,
    players = utility.players,
    AWS = require('aws-sdk'),
    BigNumber = require('big-number').n,
    $ = require('cheerio'),
    steam;
var aq = async.queue(apiRequest, 1)
var pq = async.queue(parseReplay, 1)
var api_delay = 1000
var replay_dir = process.env.REPLAY_DIR || "replays/"
var parser_file = process.env.PARSER_FILE || "./parser/target/stats-0.1.0.jar"
var api_url = "https://api.steampowered.com/IDOTA2Match_570"
var summaries_url = "http://api.steampowered.com/ISteamUser"
var host = "http://www.dotabuff.com"
if(!fs.existsSync(replay_dir)) {
    fs.mkdir(replay_dir)
}
aq.empty = function() {
    queueRequests()
}
pq.empty = function() {
    parseMatches()
}
setInterval(updatePlayerNames, 86400 * 1000)
queueRequests()
parseMatches()
//todo insert parsed data under its own key
//todo organize parsed data better
//todo update views to work with new format
//todo implement cool dynatables/pagination

function updatePlayerNames() {
    //daily, go through all the matches and update the players
    //todo albert implement this
}

function queueRequests() {
    players.find({
        track: 1
    }, function(err, docs) {
        aq.push(docs, function(err) {})
    })
    matches.find({
        "duration": {
            $exists: false
        }
    }, function(err, docs) {
        aq.push(docs, function(err) {})
    })
}

function parseMatches() {
    matches.find({
        parse_status: 0
    }, function(err, docs) {
        pq.push(docs, function(err) {})
    })
}

function createSummaryRequest(players) {
    summaries = {}
    summaries.summaries_id = 1
    summaries.players = players
    return summaries
}

function generateURL(req) {
    if(req.account_id) {
        return api_url + "/GetMatchHistory/V001/?key=" + process.env.STEAM_API_KEY + "&account_id=" + req.account_id + "&matches_requested=" + (process.env.MATCHES_REQUESTED || 10)
    }
    if(req.match_id) {
        return api_url + "/GetMatchDetails/V001/?key=" + process.env.STEAM_API_KEY + "&match_id=" + req.match_id;
    }
    if(req.summaries_id) {
        var steamids = []
        req.players.forEach(function(player) {
            var steamid64 = BigNumber('76561197960265728').plus(player.account_id).toString()
            steamids.push(steamid64)
        })
        var query = steamids.join()
        return summaries_url + "/GetPlayerSummaries/v0002/?key=" + process.env.STEAM_API_KEY + "&steamids=" + query
    }
}

function apiRequest(req, cb) {
    console.log('[QUEUES] %s api, %s parse', aq.length(), pq.length())
    utility.getData(generateURL(req), function(err, data) {
        if(err) {
            return cb(err)
        }
        if(req.full_history) {
            getFullMatchHistory(req.account_id, function(err) {
                setTimeout(cb, api_delay, null)
            })
        }
        if(req.account_id) {
            console.log("[API] games for player %s", req.account_id)
            async.map(data.result.matches, insertMatch, function(err) {
                setTimeout(cb, api_delay, null)
            })
        }
        if(req.match_id) {
            var match = data.result
            console.log("[API] details for match %s", match.match_id)
            matches.update({
                match_id: req.match_id
            }, {
                $set: match
            })
            aq.unshift(createSummaryRequest(match.players), function(err) {})
            pq.push(match, function(err) {})
            setTimeout(cb, api_delay, null)
        }
        if(req.summaries_id) {
            console.log("[API] summaries for players (batch)")
            async.map(data.response.players, insertPlayer, function(err) {
                setTimeout(cb, api_delay, null)
            })
        }
    })
}

function insertMatch(match, cb) {
    matches.findOne({
        match_id: match.match_id
    }, function(err, doc) {
        if(!doc) {
            match.parse_status = 0
            matches.insert(match)
        }
        cb(null)
    })
}

function insertPlayer(player, cb) {
    var steamid32 = BigNumber(player.steamid).minus('76561197960265728')
    console.log("[API] updating display name for id %s to %s", steamid32, player.personaname)
    players.update({
        account_id: Number(steamid32)
    }, {
        $set: {
            display_name: player.personaname
        }
    }, {
        upsert: true
    })
    cb(null)
}

function getFullMatchHistory(account_id, cb) {
    var player_url = host + "/players/" + account_id + "/matches"
    players.update({
        account_id: account_id
    }, {
        $set: {
            full_history: 0
        }
    })
    getMatchPage(player_url, function(err) {
        cb(null)
    })
}

function getMatchPage(url, cb) {
    request(url, function(err, resp, body) {
        console.log("[DOTABUFF] %s", url)
        var parsedHTML = $.load(body);
        var matchCells = parsedHTML('td[class=cell-xlarge]')
        matchCells.each(function(i, matchCell) {
            var match_url = host + $(matchCell).children().first().attr('href');
            var match = {}
            match.match_id = Number(match_url.split(/[/]+/).pop());
            insertMatch(match, function(err) {})
        })
        var nextPath = parsedHTML('a[rel=next]').first().attr('href')
        if(nextPath) {
            getMatchPage(host + nextPath, cb);
        } else {
            cb(null)
        }
    })
}

function download(match, cb) {
    var match_id = match.match_id
    var fileName = replay_dir + match_id + ".dem"
    if(fs.existsSync(fileName)) {
        console.log("[PARSER] found local replay for match %s", match_id)
        cb(null, fileName);
    } else {
        if(match.start_time > moment().subtract(7, 'days').format('X')) {
            getReplayUrl(match, function(url) {
                downloadFromSteam(url, fileName, 1000, function() {
                    console.log("[PARSER] downloaded steam replay for match %s", match_id)
                    uploadToS3(fileName, function(err) {
                        cb(null, fileName)
                    })
                })
            })
        } else {
            if(process.env.AWS_S3_BUCKET) {
                var s3 = new AWS.S3()
                var params = {
                    Bucket: process.env.AWS_S3_BUCKET,
                    Key: fileName
                }
                s3.getObject(params, function(err, data) {
                    if(err) {
                        cb("Replay expired (and not in S3)")
                    } else {
                        console.log("[PARSER] downloaded S3 replay for match %s", match_id)
                        fs.writeFileSync(fileName, data.Body);
                        cb(null, fileName)
                    }
                })
            } else {
                console.log('[S3] S3 is not defined')
                cb("Replay expired")
            }
        }
    }
}

function uploadToS3(fileName, cb) {
    if(!process.env.AWS_S3_BUCKET) {
        console.log('[S3] S3 is not defined')
        return cb(null)
    }
    var s3 = new AWS.S3()
    var params = {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: fileName
    }
    s3.headObject(params, function(err, data) {
        if(err) {
            params.Body = fs.readFileSync(fileName)
            s3.putObject(params, function(err, data) {
                if(err) {
                    console.log('[S3] could not upload to S3')
                    cb(true);
                } else {
                    console.log('[S3] Successfully uploaded replay to S3: %s ', fileName)
                    cb(null)
                }
            })
        } else {
            console.log('[S3] replay already exists in S3')
            cb(null)
        }
    })
}

function getReplayUrl(match, cb) {
    if(match.replay_url) {
        console.log("[STEAM] found replay_url in db")
        return cb(match.replay_url)
    }
    if(!steam) {
        steam = new Steam(process.env.STEAM_USER, process.env.STEAM_PASS, process.env.STEAM_GUARD_CODE);
    }
    if(!steam.ready) {
        console.log("[STEAM] not ready yet")
        setTimeout(getReplayUrl, 5000, match, cb)
    } else {
        steam.getReplayDetails(match.match_id, function(err, data) {
            if(err) {
                //todo login with another account and try again
                console.log(err)
                setTimeout(getReplayUrl, 5000, match, cb)
            } else {
                var url = "http://replay" + data.cluster + ".valve.net/570/" + data.id + "_" + data.salt + ".dem.bz2";
                matches.update({
                    match_id: match.match_id
                }, {
                    $set: {
                        replay_url: url
                    }
                })
                cb(url)
            }
        })
    }
}

function downloadFromSteam(url, fileName, timeout, cb) {
    request({
        url: url,
        encoding: null
    }, function(err, response, body) {
        if(err || response.statusCode !== 200) {
            console.log("[PARSER] failed to download from %s, retrying in %ds", url, timeout / 1000)
            setTimeout(downloadFromSteam, timeout, url, fileName, timeout * 2, cb);
        } else {
            body = Bunzip.decode(body);
            fs.writeFileSync(fileName, body);
            cb(null)
        }
    })
}

function parseReplay(match, cb) {
    var match_id = match.match_id
    download(match, function(err, fileName) {
        if(err) {
            console.log("[PARSER] Error for match %s: %s", match_id, err)
            matches.update({
                match_id: match_id
            }, {
                $set: {
                    parse_status: 1
                }
            })
            return cb(err)
        }
        console.log("[PARSER] started on %s", fileName)
        var output = ""
        var cp = spawn("java", ["-jar",
            parser_file,
            fileName
        ])
        cp.stdout.on('data', function(data) {
            output += data
        })
        cp.stderr.on('data', function(data) {
            console.log('[PARSER] match: %s, stderr: %s', match_id, data);
        })
        cp.on('close', function(code) {
            console.log('[PARSER] match: %s, exit code: %s', match_id, code);
            if(!code) {
                matches.update({
                    match_id: match_id
                }, {
                    $set: JSON.parse(output)
                })
                matches.update({
                    match_id: match_id
                }, {
                    $set: {
                        parse_status: 2
                    }
                })
                if(process.env.DELETE_REPLAYS) {
                    fs.unlink(fileName)
                }
            }
            cb(code)
        })
    })
}