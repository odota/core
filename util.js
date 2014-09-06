var util = exports
var request = require('request')
var constants = require('./constants.json')
var fs = require('fs')

util.db = require('monk')(process.env.MONGOHQ_URL || "localhost/dota");
var matches = util.db.get('matchStats');

/**
 * Gets a single match from db
 */
util.getMatch = function(id) {
    return matches.findOne({"match_id": id})
}

/**
 * Gets all matches from db
 */
util.getAllMatches = function() {
    return matches.find({}, {sort: {match_id: -1}})
}