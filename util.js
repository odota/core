var async = require('async');
var util = exports;
constants = require('./constants');

util.db = require('monk')(process.env.MONGOHQ_URL || "localhost/dota"),
    util.matches = util.db.get('matchStats');

util.getMatch = function(id) {
    return util.matches.findOne({"match_id": id})
}

util.getAllMatches = function() {
    return util.matches.find({}, {sort: {match_id: -1}})
}