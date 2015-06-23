var express = require('express');
var players = express.Router();
var async = require('async');
var config = require('../config');
var queries = require("../queries");
var fillPlayerData = require('../fillPlayerData');
players.get('/:account_id/:info?', function(req, res, next) {
    var playerPages = {
        "index": {
            "name": "Overview"
        },
        "matches": {
            "name": "Matches"
        },
        "histograms": {
            "name": "Histograms"
        },
        "activity": {
            "name": "Activity"
        },
        "counts": {
            "name": "Counts"
        },
        "advanced": {
            "name": "Advanced"
        },
        "wordcloud": {
            "name": "Word Cloud"
        }
    };
    var info = playerPages[req.params.info] ? req.params.info : "index";
    console.time("player " + req.params.account_id);
    async.series({
        "player": function(cb) {
            fillPlayerData(req.params.account_id, {
                info: info,
                query: {
                    select: req.query,
                    js_agg: info === "index" || info === "matches" ? {
                        "win": 1,
                        "games": 1,
                        "lose": 1,
                        "heroes": 1,
                        "teammates": 1
                    } : null
                }
            }, function(err, player) {
                cb(err, player);
            });
        },
        "sets": function(cb) {
            queries.getSets(function(err, results) {
                cb(err, results);
            });
        }
    }, function(err, result) {
        if (err) {
            return next(err);
        }
        console.timeEnd("player " + req.params.account_id);
        if (req.query.json && config.NODE_ENV !== "production") {
            return res.json(result.player);
        }
        res.render("player/player_" + info, {
            q: req.query,
            route: info,
            tabs: playerPages,
            player: result.player,
            trackedPlayers: result.sets.trackedPlayers,
            bots: result.sets.bots,
            ratingPlayers: result.sets.ratingPlayers,
            teammate_list: result.player.aggData.teammates,
            title: (result.player.personaname || result.player.account_id) + " - YASP"
        });
    });
});
module.exports = players;