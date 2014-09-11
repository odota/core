var utility = exports
var request = require('request')
var async = require('async')
var $ = require('cheerio')

utility.db = require('monk')(process.env.MONGOHQ_URL || "localhost/dota");
utility.matches = utility.db.get('matchStats');
utility.matches.index('match_id', {unique: true});
utility.players = utility.db.get('players');
utility.players.index('account_id', {unique: true})

utility.getData = function(url, cb){
    request(url, function (err, res, body) {
        if (err) {cb(err)}
        else if (res.statusCode != 200){
            cb("response code != 200");
        }
        else{
            cb(null, JSON.parse(body))
        }
    })
}

utility.fillPlayerNames = function(players, cb){
    async.mapSeries(players, function(player, cb){
        utility.players.findOne({account_id:player.account_id}, function(err, dbPlayer){
            if (dbPlayer){
                player.display_name = dbPlayer.display_name
            }
            else{
                player.display_name = "Anonymous"
            }
            cb(null)
        })
    }, function(err){
        cb(null, players)
    })
}

utility.insertMatch = function (match, cb){
    utility.matches.findOne({ match_id: match.match_id }, function(err, doc) {
        if(!doc){
            match.parse_status = 0;
            utility.matches.insert(match)
        }
        cb(null)
    })
}

utility.insertName = function (player, cb){
    var steamid32=BigNumber(player.steamid).minus('76561197960265728')
    console.log("[API] updating display name for id %s to %s", steamid32, player.personaname)
    utility.players.update({account_id:Number(steamid32)},{$set: {display_name:player.personaname}}, {upsert: true})
    cb(null)
}

utility.getTeammates = function(account_id, cb) {
    utility.matches.find({players: { $elemMatch: { account_id: account_id }}}, function(err, data){
        var counts = {};
        for (i=0;i<data.length;i++){ //matches
            for (j=0;j<data[i].players.length; j++){ //match players
                var player = data[i].players[j]
                if (player.account_id==account_id){
                    var playerSide = isRadiant(player)
                    var playerWinner = (playerSide && data.radiant_win) || (!playerSide && !data.radiant_win)
                    }
            }
            for (j=0;j<data[i].players.length; j++){  //match players
                var player = data[i].players[j]
                if (isRadiant(player)==playerSide){ //only check teammates of player
                    if (!counts[player.account_id]){
                        counts[player.account_id]={}
                        counts[player.account_id]["account_id"]=player.account_id;
                        counts[player.account_id]["win"]=0;
                        counts[player.account_id]["lose"]=0;
                    }
                    if (playerWinner){
                        counts[player.account_id]["win"]+=1
                    }
                    else{
                        counts[player.account_id]["lose"]+=1
                    }
                }
            }
        }
        //convert counts to array and filter
        var arr=[]
        var min_matches = 5
        for (var id in counts){
            var count = counts[id]
            if (count.win+count.lose>=min_matches){
                arr.push(count)
            }
        }
        cb(null, arr)
    })
}

function isRadiant(player){
    return player.player_slot<64
}