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
utility.constants = utility.db.get('constants');
utility.fillPlayerNames = function(players, cb) {
    async.mapSeries(players, function(player, cb) {
        utility.players.findOne({
            account_id: player.account_id
        }, function(err, dbPlayer) {
            if(dbPlayer) {
                for (var prop in dbPlayer){
                    player[prop]=dbPlayer[prop]
                }
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
utility.fillPlayerStats = function(player, matches, cb) {
    var account_id = player.account_id
    var counts = {}
    var heroes = {}
    player.aggregates={}
    for(i = 0; i < matches.length; i++) {
        for(j = 0; j < matches[i].players.length; j++) {
            var p = matches[i].players[j]
            if(p.account_id == account_id) {
                var playerRadiant = isRadiant(p)
                matches[i].player_win = (playerRadiant == matches[i].radiant_win)
                matches[i].slot = j
                matches[i].gold = ~~(p.gold_per_min*matches[i].duration/60)
                for (var prop in p){
                    matches[i][prop]=p[prop]
                }
                if(!heroes[p.hero_id]) {
                    heroes[p.hero_id] = {}
                    heroes[p.hero_id]["win"] = 0
                    heroes[p.hero_id]["lose"] = 0
                }
                if(matches[i].player_win) {
                    heroes[p.hero_id]["win"] += 1
                } else {
                    heroes[p.hero_id]["lose"] += 1
                }
            }
        }
        for(j = 0; j < matches[i].players.length; j++) {
            var p = matches[i].players[j]
            if(isRadiant(p) == playerRadiant) { //only check teammates of player
                if(!counts[p.account_id]) {
                    counts[p.account_id] = {}
                    counts[p.account_id]["account_id"] = p.account_id
                    counts[p.account_id]["win"] = 0;
                    counts[p.account_id]["lose"] = 0;
                }
                if(matches[i].player_win) {
                    counts[p.account_id]["win"] += 1
                } else {
                    counts[p.account_id]["lose"] += 1
                }
            }
        }
    }
    //convert counts to array and filter
    player.teammates = []
    for(var id in counts) {
        var count = counts[id]
        if(id == player.account_id) {
            player.win = count.win
            player.lose = count.lose
        } else {
            player.teammates.push(count)
        }
    }
    player.heroes = heroes
    utility.fillPlayerNames(player.teammates, function(err) {
        cb(null, player, matches)
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
utility.getData = function(url, cb) {
    var delay = 1000
    request(url, function(err, res, body) {
        console.log("[API] %s", url)
        if(err || res.statusCode != 200 || !body) {
            console.log("[API] error getting data, retrying")
            setTimeout(utility.getData, delay, url, cb)
        } else {
            setTimeout(cb, delay, null, JSON.parse(body))
        }
    })
}

function isRadiant(player) {
    return player.player_slot < 64
}