var async = require("async"),
    utility = require('./utility'),
    matches = utility.matches,
    players = utility.players;
var request = require("request")
var aq = async.queue(apiRequest, 1)
var api_url = "https://api.steampowered.com/IDOTA2Match_570"
var summaries_url = "http://api.steampowered.com/ISteamUser"
var queuedMatches = {}
var trackedPlayers = {}
var parser = process.env.PARSER_HOST || "localhost"
var next_seq;
utility.updateConstants()
players.find({
    track: 1
}, function(err, docs) {
    aq.push(docs, function(err) {})
})
matches.find({
    parse_status: 0
}, function(err, docs) {
    docs.forEach(function(match) {
        requestParse(match)
    })
})
utility.getData(api_url + "/GetMatchHistory/V001/?key=" + process.env.STEAM_API_KEY, function(err, data) {
    next_seq = process.env.MATCH_SEQ_NUM || data.result.matches[0].match_seq_num
    getMatches()
})
aq.empty = function() {
    getMatches()
}

function getMatches() {
    players.find({
        track: 1
    }, function(err, docs) {
        trackedPlayers = {}
        docs.forEach(function(player) {
            trackedPlayers[player.account_id] = true
        })
        aq.push({}, function(err) {})
    })
}

function requestParse(match) {
    request.post({
        url: "http://" + parser + ":9001",
        form: {
            match_id: match.match_id
        }
    }, function(err) {
        if(err) {
            requestParse(match)
        }
    })
}
/*
 * Processes a request to an api
 */

function apiRequest(req, cb) {
    var url;
    if(req.match_id) {
        url = api_url + "/GetMatchDetails/V001/?key=" + process.env.STEAM_API_KEY + "&match_id=" + req.match_id;
    } else if(req.summaries_id) {
        var steamids = []
        req.players.forEach(function(player) {
            steamids.push(utility.convert32to64(player.account_id).toString())
        })
        var query = steamids.join()
        url = summaries_url + "/GetPlayerSummaries/v0002/?key=" + process.env.STEAM_API_KEY + "&steamids=" + query
    } else if(req.account_id) {
        url = api_url + "/GetMatchHistory/V001/?key=" + process.env.STEAM_API_KEY + "&account_id=" + req.account_id
    } else {
        url = api_url + "/GetMatchHistoryBySequenceNum/V001/?key=" + process.env.STEAM_API_KEY + "&start_at_match_seq_num=" + next_seq
    }
    utility.getData(url, function(err, data) {
        if(req.match_id) {
            var match = data.result
            insertMatch(match, function(err) {
                delete queuedMatches[match.match_id]
                cb(null)
            })
        } else if(req.summaries_id) {
            async.map(data.response.players, insertPlayer, function(err) {
                cb(null)
            })
        } else if(req.account_id) {
            var resp = data.result.matches
            if(!resp) {
                console.log(data)
                return cb(null)
            }
            async.map(resp, function(match, cb) {
                matches.findOne({
                    match_id: match.match_id
                }, function(err, doc) {
                    if(!doc && !(match.match_id in queuedMatches)) {
                        queuedMatches[match.match_id] = true
                        aq.push(match, function(err) {})
                    }
                    cb(null)
                })
            }, function(err) {
                cb(null)
            })
        } else {
            var resp = data.result.matches
            if(!resp) {
                console.log(data)
                return cb(null)
            }
            console.log("[API] seq_num: %s, found %s matches", next_seq, resp.length)
            async.mapSeries(resp, insertMatch, function(err) {
                if(resp.length > 0) {
                    next_seq = resp[resp.length - 1].match_seq_num + 1
                }
                cb(null)
            })
        }
    })
}

function insertMatch(match, cb) {
    var track = match.players.some(function(element) {
        return(element.account_id in trackedPlayers)
    })
    match.parse_status = (track ? 0 : 3)
    if(track) {
        matches.insert(match)
        summaries = {}
        summaries.summaries_id = 1
        summaries.players = match.players
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