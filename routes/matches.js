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
        name: "Overview"
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
    actions: {
        name: "Actions",
        "new": true
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
            display_types: {
                "DOTA_UNIT_ORDER_MOVE_TO_POSITION": "Move (P)",
                "DOTA_UNIT_ORDER_MOVE_TO_TARGET": "Move (T)",
                "DOTA_UNIT_ORDER_ATTACK_MOVE": "Attack (M)",
                "DOTA_UNIT_ORDER_ATTACK_TARGET": "Attack (T)",
                "DOTA_UNIT_ORDER_CAST_POSITION": "Cast (P)",
                "DOTA_UNIT_ORDER_CAST_TARGET": "Cast (T)",
                //"DOTA_UNIT_ORDER_CAST_TARGET_TREE"
                "DOTA_UNIT_ORDER_CAST_NO_TARGET": "Cast (N)",
                //"DOTA_UNIT_ORDER_CAST_TOGGLE"
                "DOTA_UNIT_ORDER_HOLD_POSITION": "Hold",
                //"DOTA_UNIT_ORDER_TRAIN_ABILITY",
                "DOTA_UNIT_ORDER_DROP_ITEM": "Drop",
                "DOTA_UNIT_ORDER_GIVE_ITEM": "Give",
                "DOTA_UNIT_ORDER_PICKUP_ITEM": "Pickup",
                //"DOTA_UNIT_ORDER_PICKUP_RUNE"
                //"DOTA_UNIT_ORDER_PURCHASE_ITEM"
                //"DOTA_UNIT_ORDER_SELL_ITEM"
                //"DOTA_UNIT_ORDER_DISASSEMBLE_ITEM"
                //"DOTA_UNIT_ORDER_MOVE_ITEM"
                //"DOTA_UNIT_ORDER_CAST_TOGGLE_AUTO"
                //"DOTA_UNIT_ORDER_STOP"
                "DOTA_UNIT_ORDER_TAUNT": "Taunt",
                //"DOTA_UNIT_ORDER_BUYBACK",
                "DOTA_UNIT_ORDER_GLYPH": "Glyph",
                //"DOTA_UNIT_ORDER_EJECT_ITEM_FROM_STASH"
                //"DOTA_UNIT_ORDER_CAST_RUNE"
                "DOTA_UNIT_ORDER_PING_ABILITY": "Pings (Ability)",
                //"DOTA_UNIT_ORDER_MOVE_TO_DIRECTION": "Move (D)"
            },
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
                        if (match.parsed_data && match.parsed_data.version && config.NODE_ENV !== "development") {
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
