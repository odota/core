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
utility.getData = function(url, cb) {
    request(url, function(err, res, body) {
        if(err) {
            cb(err)
        } else if(res.statusCode != 200) {
            cb("response code != 200");
        } else {
            cb(null, JSON.parse(body))
        }
    })
}
utility.fillPlayerNames = function(players, cb) {
    async.mapSeries(players, function(player, cb) {
        utility.players.findOne({
            account_id: player.account_id
        }, function(err, dbPlayer) {
            if(dbPlayer) {
                player.display_name = dbPlayer.display_name
            } else {
                player.display_name = "Anonymous"
            }
            cb(null)
        })
    }, function(err) {
        cb(null, players)
    })
}
utility.getMatches = function(account_id, cb) {
    utility.matches.find({
        players: {
            $elemMatch: {
                account_id: account_id
            }
        },
        duration: {
            $exists: true
        }
    }, {
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
utility.getTeammates = function(account_id, cb) {
    utility.getMatches(account_id, function(err, docs) {
        var counts = {};
        for(i = 0; i < docs.length; i++) { //matches
            for(j = 0; j < docs[i].players.length; j++) { //match players
                var player = docs[i].players[j]
                if(player.account_id == account_id) {
                    var playerSide = isRadiant(player)
                    var playerWinner = (playerSide && docs[i].radiant_win) || (!playerSide && docs[i].radiant_win)
                }
            }
            for(j = 0; j < docs[i].players.length; j++) { //match players
                var player = docs[i].players[j]
                if(isRadiant(player) == playerSide) { //only check teammates of player
                    if(!counts[player.account_id]) {
                        counts[player.account_id] = {}
                        counts[player.account_id]["account_id"] = player.account_id;
                        counts[player.account_id]["win"] = 0;
                        counts[player.account_id]["lose"] = 0;
                    }
                    if(playerWinner) {
                        counts[player.account_id]["win"] += 1
                    } else {
                        counts[player.account_id]["lose"] += 1
                    }
                }
            }
        }
        //convert counts to array and filter
        var arr = []
        var min_matches = 5
        for(var id in counts) {
            var count = counts[id]
            if(count.win + count.lose >= min_matches) {
                arr.push(count)
            }
        }
        cb(null, arr)
    })
}

function isRadiant(player) {
    return player.player_slot < 64
}