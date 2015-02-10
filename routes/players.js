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
    heroes: {
        name: "Heroes"
    },
    matchups: {
        name: "Matchups"
    }
};
players.get('/:account_id/:info?', function(req, res, next) {
    var account_id = Number(req.params.account_id);
    var info = req.params.info || "index";
    db.players.findOne({
        account_id: account_id
    }, function(err, player) {
        if (err || !player || account_id === constants.anonymous_account_id) {
            return next(new Error("player not found"));
        }
        else {
            queries.fillPlayerMatches(player, constants, info === "matchups", function(err) {
                if (err) {
                    return next(err);
                }
                res.render("player_"+info, {
                    route: info,
                    player: player,
                    tabs: playerPages,
                    title: (player.personaname || player.account_id) + " - YASP"
                });
            });
        }
    });
});

module.exports = players;