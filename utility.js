var utility = exports
var request = require('request')
var async = require('async')
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
                player.display_name = dbPlayer.display_name
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
    var counts = {};
    for(i = 0; i < matches.length; i++) {
        for(j = 0; j < matches[i].players.length; j++) {
            var player = matches[i].players[j]
            if(player.account_id == account_id) {
                var playerRadiant = isRadiant(player)
                matches[i].player_win = (playerRadiant == matches[i].radiant_win)
                matches[i].player_hero = player.hero_id
            }
        }
        for(j = 0; j < matches[i].players.length; j++) {
            var player = matches[i].players[j]
            if(isRadiant(player) == playerRadiant) { //only check teammates of player
                if(!counts[player.account_id]) {
                    counts[player.account_id] = {}
                    counts[player.account_id]["account_id"] = player.account_id;
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
            if(count.win + count.lose >= (process.env.MIN_MATCHES_TEAMMATES || 3)) {
                doc.teammates.push(count)
            }
        }
    }
    utility.fillPlayerNames(doc.teammates, function(err) {
        cb(null, doc, matches)
    })
}

function isRadiant(player) {
    return player.player_slot < 64
}