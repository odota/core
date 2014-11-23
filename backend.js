var async = require("async"),
    express = require('express'),
    auth = require('http-auth'),
    request = require('request'),
    utility = require('./utility'),
    matches = utility.matches,
    players = utility.players,
    cheerio = require('cheerio'),
    winston = require('winston'),
    reds = require('reds');
var kue = utility.kue;
var jobs = utility.jobs;
var request = require("request");
var api_url = "https://api.steampowered.com/IDOTA2Match_570"
var summaries_url = "http://api.steampowered.com/ISteamUser"
var remote = "http://dotabuff.com"
var trackedPlayers = {}
var jobTimeout = 3 * 60 * 1000 // Job timeout for kue
var transports = []
if(process.env.NODE_ENV === "production") {
    transports.push(new(winston.transports.File)({
        filename: 'backend.log',
        level: 'info'
    }))
} else {
    transports.push(new(winston.transports.Console))
}
var logger = new(winston.Logger)({
    transports: transports
});
var basic = auth.basic({
    realm: "Kue"
}, function(username, password, callback) { // Custom authentication method.
    callback(username === process.env.KUE_USER && password === process.env.KUE_PASS);
});
var app = express();
app.use(auth.connect(basic));
app.use(kue.app);
app.listen(process.env.KUE_PORT || 5001);
setInterval(findStuckJobs, jobTimeout)
updateConstants(function(err) {});
async.series([
    function(cb) {
        //scrape players full match history
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
            docs.forEach(function(player) {
                queueReq("api", player)
            })
        })
        //parse unparsed matches
        matches.find({
            parse_status: 0
        }, function(err, docs) {
            docs.forEach(function(match) {
                queueReq("parse", match)
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
                getMatches(doc ? doc.match_seq_num + 1 : 0)
                cb(null)
            })
        } else {
            getData(api_url + "/GetMatchHistory/V001/?key=" + process.env.STEAM_API_KEY, function(err, data) {
                getMatches(data.result.matches[0].match_seq_num)
                cb(null)
            })
        }
    }
], function(err) {
    jobs.process('api', function(job, done) {
        setTimeout(function() {
            apiRequest(job, done)
        }, 1000)
    })
})

function updateConstants(cb) {
    var constants = require('./constants.json')
    async.map(Object.keys(constants), function(key, cb) {
        var val = constants[key]
        if(typeof(val) == "string" && val.slice(0, 4) == "http") {
            //insert API key if necessary
            val = val.slice(-4) === "key=" ? val + process.env.STEAM_API_KEY : val
            getData(val, function(err, result) {
                constants[key] = result
                cb(null)
            })
        } else {
            cb(null)
        }
    }, function(err) {
        var heroes = constants.heroes.result.heroes
        heroes.forEach(function(hero) {
            hero.img = "http://cdn.dota2.com/apps/dota2/images/heroes/" + hero.name.replace("npc_dota_hero_", "") + "_sb.png"
        })
        constants.heroes = buildLookup(heroes)
        constants.hero_names = {}
        for(var i = 0; i < heroes.length; i++) {
            constants.hero_names[heroes[i].name] = heroes[i]
        }
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
        constants.regions["251"] = "Peru"
        utility.constants.update({}, constants, {
            upsert: true
        }, function(err) {
            logger.info("[CONSTANTS] updated constants")
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

function getMatches(seq_num) {
    setTimeout(function() {
        players.find({
            track: 1
        }, function(err, docs) {
            //rebuild set of tracked players before every check
            trackedPlayers = {}
            docs.forEach(function(player) {
                trackedPlayers[player.account_id] = true
            })
            url = api_url + "/GetMatchHistoryBySequenceNum/V001/?key=" + process.env.STEAM_API_KEY + "&start_at_match_seq_num=" + seq_num
            getData(url, function(err, data) {
                if(data.result.error || data.result.status == 2) {
                    logger.info(data)
                    return getMatches(seq_num)
                }
                var resp = data.result.matches
                logger.info("[API] seq_num: %s, found %s matches", seq_num, resp.length)
                async.mapSeries(resp, insertMatch, function(err) {
                    if(resp.length > 0) {
                        seq_num = resp[resp.length - 1].match_seq_num + 1
                    }
                    getMatches(seq_num)
                })
            })
        })
    }, 1000)
}

function queueReq(type, data) {
    var url;
    var name;
    if(type === "api") {
        if(data.match_id) {
            url = api_url + "/GetMatchDetails/V001/?key=" + process.env.STEAM_API_KEY + "&match_id=" + data.match_id;
            name = "details_" + data.match_id
        } else if(data.summaries_id) {
            url = summaries_url + "/GetPlayerSummaries/v0002/?key=" + process.env.STEAM_API_KEY + "&steamids=" + data.query
            name = "summaries_" + data.summaries_id
        } else if(data.account_id) {
            url = api_url + "/GetMatchHistory/V001/?key=" + process.env.STEAM_API_KEY + "&account_id=" + data.account_id
            name = "history_" + data.account_id
        }
    }
    if(type === "parse") {
        name = "parse_" + data.match_id
        data = {
            match_id: data.match_id,
            start_time: data.start_time
        }
    }
    reds.createSearch(jobs.client.getKey('search')).query(name).end(function(err, ids) {
        if(ids.length > 0) {
            return;
        }
        jobs.create(type, {
            title: name,
            payload: data,
            url: url
        }).attempts(10).backoff({
            delay: 60000,
            type: 'exponential'
        }).searchKeys(['title']).removeOnComplete(true).save(function(err) {
            if(!err) logger.info('[KUE] %s', name)
        });
    })
}

function findStuckJobs() {
    logger.info('[KUE] Looking for stuck jobs.')
    kue.Job.rangeByState('active', 0, 10, 'ASC', function(err, ids) {
        if(!err) {
            ids.forEach(function(job) {
                if(Date.now() - job.updated_at > jobTimeout) {
                    job.state('inactive', function(err) {
                        if(err) logger.info('[KUE] Failed to move from active to inactive.')
                        else logger.info('[KUE] Unstuck %s ', job.data.title)
                    })
                }
            })
        } else {
            logger.info('[KUE] Could not connect to Kue server.')
        }
    })
}

function requestDetails(match, cb) {
    matches.findOne({
        match_id: match.match_id
    }, function(err, doc) {
        if(!doc) {
            queueReq("api", match)
        }
        cb(null)
    })
}

function getMatchPage(url, cb) {
    request(url, function(err, resp, body) {
        logger.info("[REMOTE] %s", url)
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

function apiRequest(job, cb) {
    var payload = job.data.payload
    getData(job.data.url, function(err, data) {
        if(data.response) {
            //summaries response
            async.map(data.response.players, insertPlayer, function(err) {
                cb(err)
            })
        } else if(data.result.error || data.result.status == 2) {
            logger.info(data)
            return cb(data)
        } else if(payload.match_id) {
            var match = data.result
            insertMatch(match, function(err) {
                cb(err)
            })
        } else {
            var resp = data.result.matches
            if(payload.account_id) {
                async.map(resp, function(match, cb) {
                    requestDetails(match, function(err) {
                        cb(err)
                    })
                }, function(err) {
                    cb(err)
                })
            }
        }
    })
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
        summaries = {
            summaries_id: 0
        }
        var steamids = []
        match.players.forEach(function(player) {
            steamids.push(utility.convert32to64(player.account_id).toString())
            summaries.summaries_id += player.account_id
        })
        summaries.query = steamids.join()
        queueReq("api", summaries)
        queueReq("parse", match)
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

function getData(url, cb) {
    request(url, function(err, res, body) {
        //logger.info("[API] %s", url)
        if(err || res.statusCode != 200 || !body) {
            logger.info("[API] error getting data, retrying")
            return getData(url, cb)
        } else {
            cb(null, JSON.parse(body))
        }
    })
}