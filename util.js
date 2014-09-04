var async = require('async'),
    db = require('monk')('localhost/dota'),
	matches = db.get('matchStats'),
    heroes = db.get('heroes'),
    items = db.get('items');

var util = exports;

util.getItemInfo = function(itemId, cb) {
    items.findOne({id: itemId}).on('complete', cb)
}

util.getPlayerInfo = function(player, cb) {
    heroes.findOne({id: player.hero_id}).on('complete', function(err, doc){
        if (err) cb(err)
        else {
            
            // Get items
            var items = [];
            for(var i = 0; player["item_" + i] !== undefined; i++) {
                items.push(player["item_" + i])
            }
            
            async.map(items, util.getItemInfo, function(err, results) {
                if (err) cb(err)
                else {
                    cb(null, {hero: doc, items: results})
                }
            })
        }
    })
}

util.getMatch = function(id) {
    return matches.findOne({"match_id": id})
}

util.getAllMatches = function() {
    return matches.find({}, {sort: {match_id: -1}})
}