var express = require('express');
var players = express.Router();
var async = require('async');
var db = require("../db");
var config = require('../config');
var queries = require("../queries");
var fillPlayerData = require('../fillPlayerData');
players.get('/:account_id/:info?', function(req, res, next) {
    var playerPages = {
        "index": {
            "name": "Player"
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
        }
    };
    var info = playerPages[req.params.info] ? req.params.info : "index";
    if (req.params.account_id === "all" || req.params.account_id === "professional") {
        var player = {
            account_id: req.params.account_id
        };
        if (req.params.account_id === "professional") {
            req.query.leagueid = "gtzero";
        }
        return fillPlayerData(player, {
            info: info,
            query: req.query
        }, function(err) {
            if (err) {
                return next(err);
            }
            return res.render("player/player_" + info, {
                q: req.query,
                options: {
                    js_agg: {}
                },
                route: info,
                tabs: playerPages,
                player: player
            });
        });
    }
    var account_id = Number(req.params.account_id);
    console.time("player " + account_id);
    db.players.findOne({
        account_id: account_id
    }, function(err, player) {
        if (err || !player) {
            return next(new Error("player not found"));
        }
        async.series({
            "player": function(cb) {
                //defaults: this player, balanced modes only, put the defaults in options.query
                var default_select = {
                    "players.account_id": player.account_id.toString(),
                    "significant": "1"
                };
                for (var key in default_select) {
                    req.query[key] = req.query[key] || default_select[key];
                }
                fillPlayerData(player, {
                    info: info,
                    query: req.query
                }, function(err) {
                    if (err) {
                        return cb(err);
                    }
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
            player.ratings = player.ratings ? player.ratings.reverse() : [];
            console.timeEnd("player " + account_id);
            if (req.query.json && config.NODE_ENV !== "production") {
                return res.json(player);
            }
            res.render("player/player_" + info, {
                q: req.query,
                options: {
                    js_agg: {
                        "win": 1,
                        "lose": 1,
                        "games": 1,
                        "matchups": 1,
                        "teammates": 1
                    }
                },
                route: info,
                tabs: playerPages,
                player: result.player,
                trackedPlayers: result.sets.trackedPlayers,
                bots: result.sets.bots,
                ratingPlayers: result.sets.ratingPlayers,
                title: (player.personaname || player.account_id) + " - YASP"
            });
        });
    });
});
module.exports = players;