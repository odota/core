var express = require('express');
var players = express.Router();
var db = require("../db");
var queries = require("../queries");
var fillPlayerNames = queries.fillPlayerNames;
var isRadiant = require('../utility').isRadiant;
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
            fillPlayerMatches(player, constants, info === "matchups", function(err) {
                if (err) {
                    return next(err);
                }
                queries.getSets(function(err, results) {
                    queries.getRatingData(player.account_id, function(err, ratings) {
                        res.render("player_" + info, {
                            route: info,
                            player: player,
                            ratings: ratings,
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

function computeStatistics(player, cb) {
    var counts = {};
    var against = {};
    var together = {};
    db.matches.find({
        'players.account_id': player.account_id
    }, {
        fields: {
            players: 1,
            match_id: 1,
            radiant_win: 1
        }
    }).each(function(match) {
        var playerRadiant = player.radiantMap[match.match_id];
        for (var j = 0; j < match.players.length; j++) {
            var tm = match.players[j];
            var tm_hero = tm.hero_id;
            if (isRadiant(tm) === playerRadiant) {
                //count teammate players
                if (!counts[tm.account_id]) {
                    counts[tm.account_id] = {
                        account_id: tm.account_id,
                        win: 0,
                        lose: 0,
                        games: 0
                    };
                }
                counts[tm.account_id].games += 1;
                playerRadiant === match.radiant_win ? counts[tm.account_id].win += 1 : counts[tm.account_id].lose += 1;
                //count teammate heroes
                if (!together[tm_hero]) {
                    together[tm_hero] = {
                        games: 0,
                        win: 0,
                        lose: 0
                    };
                }
                together[tm_hero].games += 1;
                playerRadiant === match.radiant_win ? together[tm_hero].win += 1 : together[tm_hero].lose += 1;
            }
            else {
                //count enemy heroes
                if (!against[tm_hero]) {
                    against[tm_hero] = {
                        games: 0,
                        win: 0,
                        lose: 0
                    };
                }
                against[tm_hero].games += 1;
                playerRadiant === match.radiant_win ? against[tm_hero].win += 1 : against[tm_hero].lose += 1;
            }
        }
    }).error(function(err) {
        return cb(err);
    }).success(function() {
        player.together = together;
        player.against = against;
        player.teammates = [];
        for (var id in counts) {
            var count = counts[id];
            player.teammates.push(count);
        }
        fillPlayerNames(player.teammates, function(err) {
            cb(err);
        });
    });
}

function fillPlayerMatches(player, constants, matchups, cb) {
    var account_id = player.account_id;
    db.matches.find({
        'players.account_id': account_id
    }, {
        fields: {
            start_time: 1,
            match_id: 1,
            game_mode: 1,
            duration: 1,
            cluster: 1,
            radiant_win: 1,
            parse_status: 1,
            "players.$": 1
        }
    }, function(err, matches) {
        if (err) {
            cb(err);
        }
        matches.sort(function(a, b) {
            return b.match_id - a.match_id;
        });
        player.win = 0;
        player.lose = 0;
        player.games = 0;
        player.histogramData = {};
        player.radiantMap = {};
        var calheatmap = {};
        var arr = Array.apply(null, new Array(120)).map(Number.prototype.valueOf, 0);
        var arr2 = Array.apply(null, new Array(120)).map(Number.prototype.valueOf, 0);
        var heroes = {};
        for (var id in constants.heroes) {
            heroes[id] = {
                hero_id: id,
                games: 0,
                win: 0,
                lose: 0
            };
        }
        for (var i = 0; i < matches.length; i++) {
            var p = matches[i].players[0];
            player.radiantMap[matches[i].match_id] = isRadiant(p);
            matches[i].player_win = (isRadiant(p) === matches[i].radiant_win); //did the player win?
            //aggregate only if valid match
            if (constants.modes[matches[i].game_mode].balanced) {
                calheatmap[matches[i].start_time] = 1;
                var mins = Math.floor(matches[i].duration / 60) % 120;
                arr[mins] += 1;
                var gpm = Math.floor(matches[i].players[0].gold_per_min / 10) % 120;
                arr2[gpm] += 1;
                player.games += 1;
                matches[i].player_win ? player.win += 1 : player.lose += 1;
                if (heroes[p.hero_id]) {
                    heroes[p.hero_id].games += 1;
                    matches[i].player_win ? heroes[p.hero_id].win += 1 : heroes[p.hero_id].lose += 1;
                }
            }
        }
        player.heroes = heroes;
        player.heroes_arr = [];
        for (var id in heroes) {
            player.heroes_arr.push(heroes[id]);
        }
        player.heroes_arr.sort(function(a, b) {
            return b.games - a.games;
        });
        player.matches = matches;
        player.histogramData.durations = arr;
        player.histogramData.gpms = arr2;
        player.histogramData.calheatmap = calheatmap;
        if (matchups) {
            computeStatistics(player, function(err) {
                cb(err);
            });
        }
        else {
            cb(err);
        }
    });
}