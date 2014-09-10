var utility = exports
var request = require('request')
var async = require('async')
var BigNumber = require('big-number').n

utility.db = require('monk')(process.env.MONGOHQ_URL || "localhost/dota");
utility.matches = utility.db.get('matchStats');
utility.matches.index('match_id', {unique: true});
utility.players = utility.db.get('players');
utility.players.index('account_id', {unique: true});

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