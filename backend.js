var async = require("async"),
    utility = require('./utility'),
    redis = require('redis');
    cheerio = require('cheerio');
    memwatch = require('memwatch');
    request = require("request");
    seaport = require('seaport');
    httpProxy = require('http-proxy'),
    matches = utility.matches,
    players = utility.players;

var server = seaport.createServer();
var port = process.env.SEAPORT_PORT || 9001;

server.listen(port, function() {
    console.log("[SEAPORT] running on port %s", port)
});

var ports = seaport.connect(port);
var redisClient = redis.createClient();
var parserNum = -1;
var aq = async.queue(apiRequest, 1)
var api_url = "https://api.steampowered.com/IDOTA2Match_570"
var summaries_url = "http://api.steampowered.com/ISteamUser"
var remote = "http://dotabuff.com"
var queuedMatches = {}
var trackedPlayers = {}
var next_seq;
var matches_in_curr_min = 0;

redisClient.del("live_matches");

memwatch.on('leak', function(info) {
    console.log(info);
});
aq.empty = function() {
    getMatches()
}
//utility.updateConstants();
async.series([
    //todo listen for requests to get full history from new players
//     function(cb) {
//         players.find({
//             full_history: 0
//         }, function(err, docs) {
//             async.mapSeries(docs, function(player, cb2) {
//                 var account_id = player.account_id
//                 var player_url = remote + "/players/" + account_id + "/matches"
//                 getMatchPage(player_url, function(err) {
//                     //done scraping player
//                     players.update({
//                         account_id: account_id
//                     }, {
//                         $set: {
//                             full_history: 1
//                         }
//                     })
//                     cb2(null)
//                 })
//             }, function(err) {
//                 //done scraping all players
//                 cb(null)
//             })
//         })
//     },
//     function(cb) {
//         //check most recent 100 matches for tracked players
//         players.find({
//             track: 1
//         }, function(err, docs) {
//             aq.push(docs, function(err) {})
//         })
//         //parse unparsed matches
//         matches.find({
//             parse_status: 0
//         }, function(err, docs) {
//             docs.forEach(function(match) {
//                 requestParse(match)
//             })
//         })
//         cb(null)
//     },
    function(cb) {
        //determine sequence number to begin scan at
        if(process.env.SAVE_ALL_MATCHES) {
            matches.findOne({}, {
                sort: {
                    match_seq_num: -1
                }
            }, function(err, doc) {
                next_seq = doc ? doc.match_seq_num + 1 : 0
                cb(null)
            })
        } else {
            utility.getData(api_url + "/GetMatchHistory/V001/?key=" + process.env.STEAM_API_KEY, function(err, data) {
                next_seq = data.result.matches[0].match_seq_num
                cb(null)
            })
        }
    }
], function(err) {
    getMatches()
})

function getMatches() {
    players.find({
        track: 1
    }, function(err, docs) {
        //rebuild set of tracked players before every check
        trackedPlayers = {}
        docs.forEach(function(player) {
            trackedPlayers[player.account_id] = true
        })
        aq.push({}, function(err) {})
    })
}

function requestParse(match) {
    ports.get('parser', function(ps) {
        parserNum = (parserNum + 1) % ps.length;
        var u = 'http://' + ps[parserNum].host + ':' + ps[parserNum].port;
        request.post({
            url: u,
            form: {
                match_id: match.match_id
            }
        }, function(err, res, body) {
            if(err || res.statusCode != 200) {
                setTimeout(function() {
                    requestParse(match)
                }, 1000)
            } else {
                console.log("[RESPONSE] %s", body)
            }
        })
    })
}

function requestDetails(match, cb) {
    matches.findOne({
        match_id: match.match_id
    }, function(err, doc) {
        if(!doc && !(match.match_id in queuedMatches)) {
            queuedMatches[match.match_id] = true
            aq.push(match, function(err) {})
        }
        cb(null)
    })
}

function getMatchPage(url, cb) {
    request(url, function(err, resp, body) {
        console.log("[REMOTE] %s", url)
        var parsedHTML = cheerio.load(body);
        var matchCells = parsedHTML('td[class=cell-xlarge]')
        matchCells.each(function(i, matchCell) {
            var match_url = remote + cheerio(matchCell).children().first().attr('href');
            var match = {}
            match.match_id = Number(match_url.split(/[/]+/).pop());
            requestDetails(match, function(err) {})
        })
        var nextPath = parsedHTML('a[rel=next]').first().attr('href')
        if(nextPath) {
            getMatchPage(remote + nextPath, cb);
        } else {
            cb(null)
        }
    })
}
/*
 * Processes a request to an api
 */

function apiRequest(req, cb) {
    console.log("[QUEUE] api requests: %s", aq.length())
    var url;
    if(req.match_id) {
        url = api_url + "/GetMatchDetails/V001/?key=" + process.env.STEAM_API_KEY + "&match_id=" + req.match_id;
    } else if(req.summaries_id) {
        url = summaries_url + "/GetPlayerSummaries/v0002/?key=" + process.env.STEAM_API_KEY + "&steamids=" + req.query
    } else if(req.account_id) {
        url = api_url + "/GetMatchHistory/V001/?key=" + process.env.STEAM_API_KEY + "&account_id=" + req.account_id
    } else {
        url = api_url + "/GetMatchHistoryBySequenceNum/V001/?key=" + process.env.STEAM_API_KEY + "&start_at_match_seq_num=" + next_seq
    }
    utility.getData(url, function(err, data) {
        if(data.response) {
            async.map(data.response.players, insertPlayer, function(err) {
                cb(null)
            })
        } else if(data.result.error || data.result.status == 2) {
            console.log(data)
            return cb(null)
        } else if(req.match_id) {
            var match = data.result
            insertMatch(match, function(err) {
                delete queuedMatches[match.match_id]
                cb(null)
            })
        } else {
            var resp = data.result.matches
            if(req.account_id) {
                async.map(resp, function(match, cb) {
                    requestDetails(match, function(err) {
                        cb(null)
                    })
                }, function(err) {
                    cb(null)
                })
            } else {
                console.log("[API] seq_num: %s, found %s matches", next_seq, resp.length)
                matches_in_curr_min += resp.length;
                async.mapSeries(resp, insertMatch, function(err) {
                    if(resp.length > 0) {
                        next_seq = resp[resp.length - 1].match_seq_num + 1
                    }
                    cb(null)
                })
            }
        }
    })
}

function addCountsToRedis() {
    redisClient.rpush("live_matches", matches_in_curr_min);
    matches_in_curr_min = 0;
    //redisClient.ltrim("live_matches", 0, 59);
}

function insertMatch(match, cb) {
    var track = match.players.some(function(element) {
        return(element.account_id in trackedPlayers)
    })
    match.parse_status = (track ? 0 : 3)
    if(process.env.SAVE_ALL_MATCHES || track) {
        matches.insert(match);
    }
    if(track) {
        //todo get player summaries separately
        summaries = {}
        summaries.summaries_id = 1
        var steamids = []
        match.players.forEach(function(player) {
            steamids.push(utility.convert32to64(player.account_id).toString())
        })
        summaries.query = steamids.join()
        aq.unshift(summaries, function(err) {})
        requestParse(match)
    }
    cb(null)
}
/*
 * Inserts/updates a player in the database
 */

function insertPlayer(player, cb) {
    var account_id = Number(utility.convert64to32(player.steamid))
    players.update({
        account_id: account_id
    }, {
        $set: player
    }, {
        upsert: true
    }, function(err) {
        cb(err)
    })
}

setInterval(addCountsToRedis, 60 * 1000);