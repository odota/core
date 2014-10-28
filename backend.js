var async = require("async"),
    utility = require('./utility'),
    matches = utility.matches,
    players = utility.players;
var cheerio = require('cheerio');
var memwatch = require('memwatch');
var request = require("request");
var seaport = require('seaport');
var httpProxy = require('http-proxy');
var server = seaport.createServer();
var port = process.env.SEAPORT_PORT || 9001;
server.listen(port, function() {
    console.log("[SEAPORT] running on port %s", port)
});
var ports = seaport.connect(port);
var parserNum = -1;
var aq = async.queue(apiRequest, 1)
var api_url = "https://api.steampowered.com/IDOTA2Match_570"
var summaries_url = "http://api.steampowered.com/ISteamUser"
var remote = "http://dotabuff.com"
var queuedMatches = {}
var trackedPlayers = {}
var next_seq;
memwatch.on('leak', function(info) {
    console.log(info);
});
updateConstants(function(err) {});
async.series([
    //todo listen for requests to get full history from new players
    function(cb) {
        players.find({
            full_history: 1
        }, function(err, docs) {
            async.mapSeries(docs, function(player, cb2) {
                var account_id = player.account_id
                var player_url = remote + "/players/" + account_id + "/matches"
                getMatchPage(player_url, function(err) {
                    //done scraping player
                    players.update({
                        account_id: account_id
                    }, {
                        $set: {
                            full_history: 0
                        }
                    })
                    cb2(null)
                })
            }, function(err) {
                //done scraping all players
                cb(null)
            })
        })
    },
    function(cb) {
        //check most recent 100 matches for tracked players
        players.find({
            track: 1
        }, function(err, docs) {
            aq.push(docs, function(err) {})
        })
        //parse unparsed matches
        matches.find({
            parse_status: 0
        }, function(err, docs) {
            docs.forEach(function(match) {
                requestParse(match)
            })
        })
        cb(null)
    },
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
    aq.empty = function() {
        getMatches();
    }
})

function updateConstants(cb) {
    var constants = require('./constants.json')
    async.map(Object.keys(constants), function(key, cb) {
        var val = constants[key]
        if(typeof(val) == "string" && val.slice(0, 4) == "http") {
            utility.getData(val, function(err, result) {
                constants[key] = result
                cb(null)
            })
        } else {
            cb(null)
        }
    }, function(err) {
        var heroes = constants.heroes
        heroes.forEach(function(hero) {
            hero.name = hero.name.replace("npc_dota_hero_", "")
            hero.img = "http://cdn.dota2.com/apps/dota2/images/heroes/" + hero.name + "_sb.png"
        })
        constants.hero_names = {}
        for(var i = 0; i < heroes.length; i++) {
            constants.hero_names[heroes[i].name] = heroes[i]
        }
        constants.heroes = buildLookup(heroes)
        var items = constants.items.itemdata
        constants.item_ids = {}
        for(var key in items) {
            constants.item_ids[items[key].id] = key
            items[key].img = "http://cdn.dota2.com/apps/dota2/images/items/" + items[key].img
        }
        constants.items = items
        var lookup = {}
        var ability_ids = constants.ability_ids.abilities
        for(var i = 0; i < ability_ids.length; i++) {
            lookup[ability_ids[i].id] = ability_ids[i].name
        }
        constants.ability_ids = lookup
        constants.ability_ids["5601"] = "techies_suicide"
        constants.ability_ids["5088"] = "skeleton_king_mortal_strike"
        constants.ability_ids["5060"] = "nevermore_shadowraze1"
        constants.ability_ids["5061"] = "nevermore_shadowraze1"

        var abilities = constants.abilities.abilitydata
        for(var key in abilities) {
            abilities[key].img = "http://cdn.dota2.com/apps/dota2/images/abilities/" + key + "_md.png"
        }
        abilities["stats"] = {
            dname: "Stats",
            img: '../../public/images/Stats.png'
        }
        constants.abilities = abilities
        var lookup = {}
        var regions = constants.regions.regions
        for(var i = 0; i < regions.length; i++) {
            lookup[regions[i].id] = regions[i].name
        }
        constants.regions = lookup
        constants.regions["251"]="Peru"
        utility.constants.update({}, constants, {
            upsert: true
        }, function(err) {
            console.log("[CONSTANTS] updated constants")
            cb(null)
        })
    })
}

function buildLookup(array) {
    var lookup = {}
    for(var i = 0; i < array.length; i++) {
        lookup[array[i].id] = array[i]
    }
    return lookup
}

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
    setTimeout(function(){
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
                    async.mapSeries(resp, insertMatch, function(err) {
                        if(resp.length > 0) {
                            next_seq = resp[resp.length - 1].match_seq_num + 1
                        }
                        cb(null)
                    })
                }
            }
        })
    }, 1000)
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