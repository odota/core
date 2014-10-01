var utility = exports,
    fs = require('fs'),
    request = require('request'),
    async = require('async'),
    BigNumber = require('big-number').n
    utility.db = require('monk')(process.env.MONGOHQ_URL || "localhost/dota");
utility.matches = utility.db.get('matches');
utility.matches.index('match_id', {
    unique: true
});

utility.players = utility.db.get('players');
utility.players.index('account_id', {
    unique: true
})

utility.fillPlayerNames = function(players, cb) {
    async.mapSeries(players, function(player, cb) {
        utility.players.findOne({
            account_id: player.account_id
        }, function(err, dbPlayer) {
            if(dbPlayer) {
                player.personaname = dbPlayer.personaname
            }
            cb(null)
        })
    }, function(err) {
        cb(err)
    })
}

utility.getLastMatch = function(account_id, cb) {
    var search = {
        duration: {
            $exists: true
        }
    }
   
    search.players = {
        $elemMatch: {
            account_id: account_id
        }
    }
    
    utility.matches.findOne(search, {
        sort: {
            match_id: -1
        }
    }, function(err, docs) {
        cb(err, docs)
    })
}

utility.getMatches = function(account_id, cb) {
    var search = {
        duration: {
            $exists: true
        }
    }
    if(account_id) {
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
utility.getTrackedPlayers = function(cb) {
    utility.players.find({
        track: 1
    }, function(err, docs) {
        cb(err, docs)
    })
}

utility.fillPlayerStats = function(doc, matches, cb) {
    var account_id = doc.account_id
    var counts = {}
    var heroes = {}
    for(i = 0; i < matches.length; i++) {
        for(j = 0; j < matches[i].players.length; j++) {
            var player = matches[i].players[j]
            if(player.account_id == account_id) {
                var playerRadiant = isRadiant(player)
                matches[i].player_win = (playerRadiant == matches[i].radiant_win)
                matches[i].player_hero = player.hero_id
                if(!heroes[player.hero_id]) {
                    heroes[player.hero_id] = {}
                    heroes[player.hero_id]["hero_id"] = player.hero_id
                    heroes[player.hero_id]["win"] = 0
                    heroes[player.hero_id]["lose"] = 0
                }
                if(matches[i].player_win) {
                    heroes[player.hero_id]["win"] += 1
                } else {
                    heroes[player.hero_id]["lose"] += 1
                }
            }
        }
        for(j = 0; j < matches[i].players.length; j++) {
            var player = matches[i].players[j]
            if(isRadiant(player) == playerRadiant) { //only check teammates of player
                if(!counts[player.account_id]) {
                    counts[player.account_id] = {}
                    counts[player.account_id]["account_id"] = player.account_id
                    counts[player.account_id]["win"] = 0;
                    counts[player.account_id]["lose"] = 0;
                }
                if(matches[i].player_win) {
                    counts[player.account_id]["win"] += 1
                } else {
                    counts[player.account_id]["lose"] += 1
                }
            }
        }
    }
    //convert counts to array and filter
    doc.teammates = []
    for(var id in counts) {
        var count = counts[id]
        if(id == doc.account_id) {
            doc.win = count.win
            doc.lose = count.lose
        } else {
            if(count.win + count.lose >= 3) {
                doc.teammates.push(count)
            }
        }
    }
    doc.heroes = []
    for(var id in heroes) {
        var count = heroes[id]
        doc.heroes.push(count)
    }
    utility.fillPlayerNames(doc.teammates, function(err) {
        cb(null, doc, matches)
    })
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

utility.getData = function getData(url, cb) {
    var delay = 1000
    request(url, function(err, res, body) {
        console.log("[API] %s", url)
        if(err || res.statusCode != 200) {
            console.log("[API] error getting data, retrying")
            setTimeout(utility.getData, delay, url, cb)
        } else {
            setTimeout(cb, delay, null, JSON.parse(body))
        }
    })
}

utility.updateConstants = function updateConstants() {
    var constants = require('./constants.json')
    async.map(["https://api.steampowered.com/IEconDOTA2_570/GetHeroes/v0001/?key=" + process.env.STEAM_API_KEY + "&language=en-us", "https://www.dota2.com/jsfeed/itemdata", "https://raw.githubusercontent.com/kronusme/dota2-api/master/data/regions.json"], utility.getData, function(err, results) {
        var heroes = results[0].result.heroes
        var items = results[1].itemdata
        heroes.forEach(function(hero) {
            hero.img = "http://cdn.dota2.com/apps/dota2/images/heroes/" + hero.name.replace('npc_dota_hero_', "") + "_sb.png"
        })
        constants.item_ids = {}
        for(var key in items) {
            constants.item_ids[items[key].id] = key
            items[key].img = "http://cdn.dota2.com/apps/dota2/images/items/" + items[key].img
        }
        constants.heroes = buildLookup(heroes)
        constants.items = items
        constants.regions = buildLookup(results[2].regions)
        console.log("[UPDATE] writing constants file")
        fs.writeFileSync("./constants.json", JSON.stringify(constants, null, 4))
    })
}

function buildLookup(array) {
    var lookup = {}
    for(var i = 0; i < array.length; i++) {
        lookup[array[i].id] = array[i]
        lookup[array[i].name] = array[i]
    }
    return lookup
}

function isRadiant(player) {
    return player.player_slot < 64
}