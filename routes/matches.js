var express = require('express');
var matches = express.Router();
var db = require("../db");
var queries = require("../queries");
var constants = require("../constants.json");
var redis = require('../redis').client;
var matchPages = {
    index: {
        name: "Match"
    },
    details: {
        name: "Details"
    },
    timelines: {
        name: "Timelines"
    },
    graphs: {
        name: "Graphs"
    },
    chat: {
        name: "Chat"
    }
};
matches.get('/', function(req, res) {
    res.render('matches.jade', {
        title: "Matches - YASP"
    });
});
matches.param('match_id', function(req, res, next, id) {
    redis.get(id, function(err, reply) {
        if (!err && reply) {
            console.log("Cache hit for match " + id);
            req.match = JSON.parse(reply);
            return next();
        }
        else {
            console.log("Cache miss for match " + id);
            db.matches.findOne({
                match_id: Number(id)
            }, function(err, match) {
                console.log("Find One for " + id + " has returned");
                if (err || !match) {
                    console.log("Find One for " + id + " has returned err or !match");
                    return next(new Error("match not found"));
                }
                else {
                    console.log("Requesting fillPlayerNames for " + id);
                    queries.fillPlayerNames(match.players, function(err) {
                        if (err) {
			    console.log("fillPlayerNames for " + id + " returned err");
                            return next(err);
                        }
		        console.log("fillPlayerNames for " + id + " has returned successfully");
                        req.match = match;
                        if (match.parsed_data) {
                            queries.mergeMatchData(match, constants);
                            queries.generateGraphData(match, constants);
                        }
                        //Add to cache if we have parsed data
                        if (match.parsed_data && process.env.NODE_ENV !== "development") {
                            redis.setex(id, 86400, JSON.stringify(match));
                        }
                        return next();
                    });
                }
            });
        }
    });
});
matches.get('/:match_id/:info?', function(req, res, next) {
    var match = req.match;
    var info = req.params.info || "index";
    res.render("match_" + info, {
        route: info,
        match: match,
        tabs: matchPages,
        title: "Match " + match.match_id + " - YASP"
    });
});

module.exports = matches;
