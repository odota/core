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
    if (options.info==="index"){
        //index is loaded completely via ajax
        return cb(null, player);
    }
    //options.query, the querystring from the user, pass these as select conditions
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
        cb(err, player);
    });
}
module.exports = players;