var express = require('express');
var matches = express.Router();
var queries = require('../queries');
var config = require('../config');
var compute = require('../compute');
var computeMatchData = compute.computeMatchData;
var renderMatch = compute.renderMatch;
var redis = require('../redis').client;
var db = require('../db');
var matchPages = {
    index: {
        name: "Basic"
    },
    performances: {
        name: "Performances"
    },
    purchases: {
        name: "Purchases"
    },
    farm: {
        name: "Farm"
    },
    combat: {
        name: "Combat"
    },
    graphs: {
        name: "Graphs"
    },
    positions: {
        name: "Positions"
    },
    objectives: {
        name: "Objectives"
    },
    teamfights: {
        name: "Teamfights"
    },
    chat: {
        name: "Chat"
    }
};
matches.get('/:match_id/:info?', function(req, res, next) {
    console.time("match page");
    prepareMatch(req.params.match_id, function(err, match) {
        if (err) {
            return next(err);
        }
        console.timeEnd("match page");
        var info = matchPages[req.params.info] ? req.params.info : "index";
        if (req.query.json) {
            return res.json(match);
        }
        res.render("match/match_" + info, {
            route: info,
            match: match,
            tabs: matchPages,
            title: "Match " + match.match_id + " - YASP"
        });
    });
});

function prepareMatch(match_id, cb) {
    var key = "match:" + match_id;
    redis.get(key, function(err, reply) {
        if (!err && reply) {
            console.log("Cache hit for match " + match_id);
            try {
                var match = JSON.parse(reply);
                return cb(err, match);
            }
            catch (e) {
                return cb(e);
            }
        }
        else {
            console.log("Cache miss for match " + match_id);
            db.matches.findOne({
                match_id: Number(match_id)
            }, function(err, match) {
                if (err || !match) {
                    return cb("match not found");
                }
                else {
                    queries.fillPlayerNames(match.players, function(err) {
                        if (err) {
                            return cb(err);
                        }
                        computeMatchData(match);
                        renderMatch(match);
                        //Add to cache if match is parsed
                        if (match.parse_status === 2 && config.NODE_ENV !== "development") {
                            redis.setex(key, 3600, JSON.stringify(match));
                        }
                        return cb(err, match);
                    });
                }
            });
        }
    });
}
module.exports = matches;
