var express = require('express');
var players = express.Router();
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
    matchups: {
        name: "Matchups"
    }
};
players.get('/:account_id/:info?', function(req, res, next) {
    var account_id = Number(req.params.account_id);
    var info = playerPages[req.params.info] ? req.params.info : "index";
    db.players.findOne({
        account_id: account_id
    }, function(err, player) {
        if (err || !player || account_id === constants.anonymous_account_id) {
            return next(new Error("player not found"));
        }
        else {
            queries.fillPlayerMatches(player, constants, info === "matchups", function(err) {
                queries.getSets(function(err, results) {
                    queries.getRatingData(player.account_id, function(err, ratings) {
                        player.ratings = ratings;
                        res.render("player_" + info, {
                            route: info,
                            player: player,
                            tabs: playerPages,
                            trackedPlayers: results.trackedPlayers,
                            bots: results.bots,
                            ratingPlayers: results.ratingPlayers,
                            title: (player.personaname || player.account_id) + " - YASP"
                        });
                    });
                });
            });
        }
    });
});
module.exports = players;