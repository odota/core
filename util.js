var request = require('request');
var constants = require('./constants.json');

exports.db = require('monk')(process.env.MONGOHQ_URL || "localhost/dota"),
    matches = exports.db.get('matchStats');

exports.extractPlayerInfo = function(match) {
    var playerInfoList= []
    for (var j=0; j<match.players.length;j++){
        var player = match.players[j];
        var playerInfo = {};
        playerInfo.hero = constants.heroes[player.hero_id.toString()]
        playerInfo.items= []
        for(var i = 0; player["item_" + i] !== undefined; i++) {
            playerInfo.items.push(constants.items[player["item_" + i].toString()])
        }
        if (player.additional_units) {
            playerInfo.additional_items=[];
            for(var i = 0; player.additional_units[0]["item_" + i] !== undefined; i++) {
                playerInfo.additional_items.push(constants.items[player.additional_units[0]["item_" + i].toString()])
            }	    
        }
        playerInfoList.push(playerInfo);
    }
    return playerInfoList
}

/**
 * Gets a single match from db
 */
exports.getMatch = function(id) {
    return matches.findOne({"match_id": id})
}

/**
 * Gets all matches from db
 */
exports.getAllMatches = function() {
    return matches.find({}, {sort: {match_id: -1}})
}

exports.updateHeroes = function updateHeroes(cb){
    request("https://api.steampowered.com/IEconDOTA2_570/GetHeroes/v0001/?key="+process.env.STEAM_API_KEY+"&language=en-us", function (error, response, body) {
        if (!error && response.statusCode == 200) {
            console.log("updating heroes");
            var array = JSON.parse(body).result.heroes;
            var lookup={}
            for (var i = 0; i < array.length;i++) {
                lookup[array[i].id] = array[i];
            }
            constants.heroes = lookup;
            cb()
        }
    })
}

exports.updateItems = function updateItems(cb){
    request("http://www.dota2.com/jsfeed/itemdata", function (error, response, body) {
        if (!error && response.statusCode == 200) {
            console.log("updating items");
            var objects = JSON.parse(body).itemdata;
            var lookup={}
            for(var key in objects) {
                lookup[objects[key].id] = objects[key];
            }
            constants.items = lookup;
            cb()
        }
    })
}

exports.writeConstants = function writeConstants(cb){    
    var fs = require('fs');
    console.log("writing constants file");
    fs.writeFileSync("./constants.json", JSON.stringify(constants, null, 4));
    cb()
}