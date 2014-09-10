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
            //console.log("[REQUEST] got data from %s", url)
            cb(null, JSON.parse(body))
        }
    })
}

utility.updateDisplayNames = function(doc, cb){
    var steamids=[]
    if (doc.account_id){
        doc.players=[{account_id:doc.account_id}]
    }
    doc.players.forEach(function(player){
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

/**
 * Gets a single match from db
 */
utility.getMatch = function(id) {
    return utility.matches.findOne({"match_id": id})
}

/**
 * Gets all matches from db that can be displayed
 */
utility.getAllMatches = function() {
    return utility.matches.find({"duration":{$exists:true}}, {sort: {match_id: -1}})
}

var host = "http://www.dotabuff.com"
/*
 * Gets the teammate counts for a particular player
 */
utility.getCounts =function(account_id, paginate, callback) {
    utility.getMatches(host+"/players/"+account_id+"/matches", paginate, function(err){
        utility.dotabuffMatches.find({players: { $elemMatch: { id: account_id }}}, function(err, data){
            var counts = {};
            for (i=0;i<data.length;i++){
                for (j=0;j<data[i].players.length; j++){
                    var player = data[i].players[j]
                    if (player.id==account_id){
                        var playerResult = player.winner;
                    }
                }
                for (j=0;j<data[i].players.length; j++){
                    var player = data[i].players[j]
                    if (player.winner == playerResult){
                        if (!counts[player.id]){
                            counts[player.id]={};
                            counts[player.id]["win"]=0;
                            counts[player.id]["lose"]=0;
                        }
                        if (player.winner){
                            counts[player.id]["win"]+=1;
                        }
                        else{
                            counts[player.id]["lose"]+=1;
                        }
                    }
                }
            }
            callback(counts);
        })
    })
}

utility.getMatches=function(player_url, paginate, callback){
    request(player_url, function processMatches (err, resp, html) {
        console.log(player_url)
        if (err) throw err
        var parsedHTML = $.load(html);
        var matchCells = parsedHTML('td[class=cell-xlarge]')
        var vals = [];
        var i = 0
        while(matchCells[i.toString]){
            vals.push(matchCells[i.toString()])
            i++
        }
        async.map(vals, function(matchCell, cb){
            var match_url = host+$(matchCell).children().first().attr('href'); 
            console.log(match_url)
            utility.dotabuffMatches.findOne({match_id: getIdFromPath(match_url)}, function(err, data) {
                if (err) throw err
                if (!data) {
                    request(match_url, function (err, resp, body) {
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

function isEmpty(obj) {
    for(var prop in obj) {
        if(obj.hasOwnProperty(prop))
            return false;
    }
    return true;
}