var util = exports
var request = require('request')
var constants = require('./constants.json')
var fs = require('fs')

util.db = require('monk')(process.env.MONGOHQ_URL || "localhost/dota");
util.matches = util.db.get('matchStats');
util.matches.index('match_id', {unique: true});
util.players = util.db.get('players');
util.players.index('player_id', {unique: true});

/**
 * Gets a single match from db
 */
util.getMatch = function(id) {
    return util.matches.findOne({"match_id": id})
}

/**
 * Gets all matches from db
 */
util.getAllMatches = function() {
    return util.matches.find({}, {sort: {match_id: -1}})
}