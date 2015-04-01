var express = require('express');
var players = express.Router();
var async = require('async');
var db = require("../db");
var queries = require("../queries");
var constants = require("../constants.json");
var playerPages = {
    index: {
        name: "Player"
    },
    matches: {
        name: "Matches"
    },
    trends: {
        name: "Trends"
    }
};
players.get('/:account_id/:info?', function(req, res, next) {
    var account_id = Number(req.params.account_id);
    console.time("player " + account_id);
    var info = playerPages[req.params.info] ? req.params.info : "index";
    db.players.findOne({
        account_id: account_id
    }, function(err, player) {
        if (err || !player || account_id === constants.anonymous_account_id) {
            return next(new Error("player not found"));
        }
        else {
            async.series({
                "player": function(cb) {
                    queries.fillPlayerData(player, {
                        info: req.params.info,
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
                },
                "ratings": function(cb) {
                    queries.getRatingData(player.account_id, function(err, ratings) {
                        cb(err, ratings);
                    });
                }
            }, function(err, result) {
                if (err) {
                    return next(err);
                }
                console.timeEnd("player " + account_id);
                res.render("player_" + info, {
                    q: req.query,
                    route: info,
                    tabs: playerPages,
                    player: result.player,
                    ratings: result.ratings,
                    trackedPlayers: result.sets.trackedPlayers,
                    bots: result.sets.bots,
                    ratingPlayers: result.sets.ratingPlayers,
                    title: (player.personaname || player.account_id) + " - YASP"
                });
            });
        }
    });
});
module.exports = players;