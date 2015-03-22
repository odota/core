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
            var projection = {
                "players.$": 1,
                start_time: 1,
                match_id: 1,
                duration: 1,
                cluster: 1,
                radiant_win: 1,
                parse_status: 1,
                first_blood_time: 1,
                lobby_type: 1,
                game_mode: 1
            };
            if (req.params.info === "trends") {
                projection.parsed_data = 1;
            }
            async.series({
                "player": function(cb) {
                    queries.fillPlayerMatches(player, {
                        select: {
                            hero_id: req.query.hero_id
                        },
                        project: projection
                    }, function(err) {
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