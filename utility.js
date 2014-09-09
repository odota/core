var utility = exports
var request = require('request')

utility.db = require('monk')(process.env.MONGOHQ_URL || "localhost/dota");
utility.matches = utility.db.get('matchStats');
utility.matches.index('match_id', {unique: true});
utility.players = utility.db.get('players');
utility.players.index('player_id', {unique: true});

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

/**
 * Gets a single match from db
 */
utility.getMatch = function(id) {
    return utility.matches.findOne({"match_id": id})
}

/**
 * Gets all matches from db
 */
utility.getAllMatches = function() {
    return utility.matches.find({}, {sort: {match_id: -1}})
}