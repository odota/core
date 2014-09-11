var utility = exports
var request = require('request')
var async = require('async')
var BigNumber = require('big-number').n
var $ = require('cheerio')

utility.db = require('monk')(process.env.MONGOHQ_URL || "localhost/dota");
utility.matches = utility.db.get('matchStats');
utility.matches.index('match_id', {unique: true});
utility.players = utility.db.get('players');
utility.players.index('account_id', {unique: true})
utility.dotabuffMatches = utility.db.get('dotabuffMatches')
utility.dotabuffMatches.index('match_id', {unique: true})

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

utility.updateDisplayNames = function(players, cb){
    var steamids=[]
    players.forEach(function(player){
        var steamid64=BigNumber('76561197960265728').plus(player.account_id).toString()
        steamids.push(steamid64)
    })
    var query = steamids.join()
    var url = "http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key="+process.env.STEAM_API_KEY+"&steamids="+query
    utility.getData(url, function(err, data){
        data.response.players.forEach(function(player){
            var steamid32=BigNumber(player.steamid).minus('76561197960265728')
            console.log("updating display name for id %s, %s", steamid32, player.personaname)
            utility.players.update({account_id:Number(steamid32)},{$set: {display_name:player.personaname}}, {upsert: true})
        })
        cb(null)
    })
}

var host = "http://www.dotabuff.com"
utility.getCounts =function(account_id, paginate, callback) {
    utility.getMatches(host+"/players/"+account_id+"/matches", paginate, function(err){
        utility.matchStats.find({players: { $elemMatch: { account_id: account_id }}}, function(err, data){
            var counts = {};
            for (i=0;i<data.length;i++){ //matches
                for (j=0;j<data[i].players.length; j++){ //match players
                    var player = data[i].players[j]
                    //if between 0 and 4, radiant
                    //if between 124 an 128, dire
                    if (player.account_id==account_id){
                        var playerResult = //player id between 0 and 4 and radiant win true or player id between 124 and 128 and radiant win false
                    }
                }
                for (j=0;j<data[i].players.length; j++){
                    var player = data[i].players[j]
                    if (player.winner == playerResult){ //only check teammates of player
                        if (!counts[player.account_id]){
                            counts[player.account_id]=player;
                            counts[player.account_id]["win"]=0;
                            counts[player.account_id]["lose"]=0;
                        }
                        if (player.winner){
                            counts[player.account_id]["win"]+=1;
                        }
                        else{
                            counts[player.account_id]["lose"]+=1;
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
            callback(arr);
        })
    })
}

utility.getMatches=function(player_url, paginate, callback){
    request(player_url, function processMatches (err, resp, html) {
        console.log(player_url)
        if (err) throw err
        var parsedHTML = $.load(html);
        var dataObject = parsedHTML('td[class=cell-xlarge]')
        var dataArray = [];
        dataObject.each(function(i, elem) {
            dataArray.push(elem);
        })
        async.map(dataArray, function(matchCell, cb){
            var match_url = host+$(matchCell).children().first().attr('href');
            //just get the match ids and get data from valve api
            utility.dotabuffMatches.findOne({match_id: getIdFromPath(match_url)}, function(err, data) {
                if (err) throw err
                if (!data) {
                    request(match_url, function (err, resp, body) {
                        console.log(match_url)
                        if (err) throw err
                        var matchHTML = $.load(body)
                        var radiant_win=matchHTML('.match-result').hasClass('radiant');
                        var match = {};
                        match.match_id = getIdFromPath(match_url);
                        match.players=[];
                        matchHTML('a[class=player-radiant]').map(function(i, link) {
                            player={};
                            player.id=getIdFromPath($(link).attr('href'));
                            player.winner=radiant_win;
                            match.players.push(player);
                        })
                        matchHTML('a[class=player-dire]').map(function(i, link) {
                            player={};
                            player.id=getIdFromPath($(link).attr('href'));
                            player.winner=!radiant_win;
                            match.players.push(player);                        
                        })
                        utility.dotabuffMatches.insert(match);
                        cb(null)
                    })
                }
                else{
                    cb(null)
                }
            })   
        }, function(err){
            var nextPath = parsedHTML('a[rel=next]').first().attr('href')
            if (paginate && nextPath){
                console.log("going to next page")
                utility.getMatches(host+nextPath, true, callback);
            }
            else{
                callback(null)
            }  
        })
    })
}

function getIdFromPath(input){
    return Number(input.split(/[/]+/).pop());
}