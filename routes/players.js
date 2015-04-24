var express = require('express');
var players = express.Router();
var async = require('async');
var db = require("../db");
var queries = require("../queries");
var constants = require("../constants.json");
var advQuery = require('../advquery');
var utility = require('../utility');
var config = require('../config');
var playerPages = {
    index: {
        name: "Player"
    },
    histograms: {
        name: "Histograms"
    },
    activity: {
        name: "Activity"
    },
    counts: {
        name: "Counts"
    },
    advanced: {
        name: "Advanced"
    }
};
players.get('/:account_id/:info?', function(req, res, next) {
    var info = playerPages[req.params.info] ? req.params.info : "index";
    var account_id = Number(req.params.account_id);
    console.time("player " + account_id);
    db.players.findOne({
        account_id: account_id
    }, function(err, player) {
        if (err || !player || account_id === constants.anonymous_account_id) {
            return next(new Error("player not found"));
        }
        else {
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
                    route: info,
                    tabs: playerPages,
                    player: result.player,
                    trackedPlayers: result.sets.trackedPlayers,
                    bots: result.sets.bots,
                    ratingPlayers: result.sets.ratingPlayers,
                    title: (player.personaname || player.account_id) + " - YASP"
                });
            });
        }
    });
});

function fillPlayerData(player, options, cb) {
    //received from controller
    //options.info, the tab the player is on
    //options.query, the querystring from the user, pass these as select conditions
    /*
    //null aggs everything by default
    var js_agg = (options.info === "trends") ? null : {
        "win": 1,
        "lose": 1,
        "games": 1,
        "matchups": 1,
        "teammates": 1
    };
    */
    advQuery({
        select: options.query,
        project: null, //just project default fields
        js_agg: null,
        js_sort: {
            match_id: -1
        }
    }, function(err, results) {
        if (err) {
            return cb(err);
        }
        player.matches = results.data;
        player.aggData = results.aggData;
        if (player.aggData.obs) {
            //generally position data function is used to generate heatmap data for each player in a natch
            //we use it here to generate a single heatmap for aggregated counts
            player.obs = player.aggData.obs.counts;
            player.sen = player.aggData.sen.counts;
            var d = {
                "obs": true,
                "sen": true
            };
            utility.generatePositionData(d, player);
            player.posData = [d];
        }
        //get teammates, heroes, convert hashes to arrays and sort them
        player.heroes_arr = [];
        var matchups = player.aggData.matchups;
        for (var id in matchups) {
            var h = matchups[id];
            player.heroes_arr.push(h);
        }
        player.heroes_arr.sort(function(a, b) {
            return b.games - a.games;
        });
        player.teammates = [];
        var teammates = player.aggData.teammates;
        for (var id in teammates) {
            var tm = teammates[id];
            id = Number(id);
            //don't include if anonymous, the player himself, or if less than 3 games
            if (id !== constants.anonymous_account_id && id !== player.account_id && tm.games >= 3) {
                player.teammates.push(tm);
            }
        }
        player.teammates.sort(function(a, b) {
            return b.games - a.games;
        });
        console.time('teammate_lookup');
        queries.fillPlayerNames(player.teammates, function(err) {
            console.timeEnd('teammate_lookup');
            cb(err, player);
        });
    });
}
module.exports = players;