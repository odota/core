var express = require('express');
var matches = express.Router();
var db = require("../db");
var utility = require('../utility');
var mode = utility.mode;
var mergeObjects = utility.mergeObjects;
var queries = require('../queries');
var constants = require('../constants.json');
var redis = require('../redis').client;
var matchPages = {
    index: {
        name: "Match"
    },
    details: {
        name: "Details"
    },
    timelines: {
        name: "Timelines"
    },
    graphs: {
        name: "Graphs"
    },
    positions: {
        name: "Positions"
    },
    chat: {
        name: "Chat"
    }
};
matches.get('/', function(req, res) {
    res.render('matches.jade', {
        title: "Matches - YASP"
    });
});
matches.param('match_id', function(req, res, next, id) {
    var key = "match:" + id;
    redis.get(key, function(err, reply) {
        if (!err && reply) {
            console.log("Cache hit for match " + id);
            try {
                req.match = JSON.parse(reply);
                return next(err);
            }
            catch (e) {
                return next(e);
            }
        }
        else {
            console.log("Cache miss for match " + id);
            db.matches.findOne({
                match_id: Number(id)
            }, function(err, match) {
                if (err || !match) {
                    return next(new Error("match not found"));
                }
                else {
                    queries.fillPlayerNames(match.players, function(err) {
                        if (err) {
                            return next(err);
                        }
                        req.match = match;
                        if (match.parsed_data) {
                            if (match.parsed_data.version < 5) {
                                mergeMatchData(match);
                                //patch old data to fit new format
                                //works for v4, anyway
                                match.players.forEach(function(player, i) {
                                    var hero = constants.heroes[player.hero_id];
                                    var parsedHero = match.parsed_data.heroes[hero.name];
                                    var parsedPlayer = match.parsed_data.players[i];
                                    parsedPlayer.purchase = parsedHero.itembuys;
                                    parsedPlayer.buyback_log = parsedPlayer.buybacks;
                                    parsedPlayer.stuns = parsedPlayer.stuns;
                                    parsedPlayer.ability_uses = parsedHero.abilityuses;
                                    parsedPlayer.item_uses = parsedHero.itemuses;
                                    parsedPlayer.gold_reasons = parsedHero.gold_log;
                                    parsedPlayer.xp_reasons = parsedHero.xp_log;
                                    parsedPlayer.damage = parsedHero.damage;
                                    parsedPlayer.hero_hits = parsedHero.hero_hits;
                                    parsedPlayer.purchase_log = parsedHero.timeline;
                                    parsedPlayer.kill_log = parsedHero.herokills;
                                    parsedPlayer.pos = parsedPlayer.positions || [];
                                    parsedPlayer.obs = [];
                                    parsedPlayer.sen = [];
                                    parsedPlayer.runes = {};
                                    parsedPlayer.pos = parsedPlayer.pos.map(function(p) {
                                        return {
                                            x: p[0] - 64,
                                            y: 127 - (p[1] - 64),
                                            value: 1
                                        };
                                    });
                                    var start = parsedPlayer.pos.slice(0, 10);
                                    var lanes = start.map(function(p) {
                                        //y first, then x due to array of arrays structure
                                        return constants.lanes[p.y][p.x];
                                    });
                                    //determine lane
                                    parsedPlayer.lane = mode(lanes);
                                });
                                match.parsed_data.chat.forEach(function(c) {
                                    c.key = c.text;
                                });
                            }
                            match.players.forEach(function(player) {
                                player.isRadiant = utility.isRadiant(player);
                                //mapping 0 to 0, 128 to 5, etc.
                                var parseSlot = player.player_slot % (128 - 5);
                                var p = match.parsed_data.players[parseSlot];
                                //generate position data from hashes
                                var keys = ["obs", "sen", "pos"];
                                keys.forEach(function(key) {
                                    var t = [];
                                    for (var x in p[key]) {
                                        for (var y in p[key][x]) {
                                            t.push({
                                                x: Number(x),
                                                y: Number(y),
                                                value: p[key][x][y]
                                            });
                                        }
                                    }
                                    p[key] = t;
                                });
                                player.parsedPlayer=p;
                            });
                            sortDetails(match);
                            generateGraphData(match);
                        }
                        //Add to cache if we have parsed data
                        if (match.parsed_data && process.env.NODE_ENV !== "development") {
                            redis.setex(key, 86400, JSON.stringify(match));
                        }
                        return next();
                    });
                }
            });
        }
    });
});
matches.get('/:match_id/:info?', function(req, res, next) {
    var match = req.match;
    var tabs = match.parsed_data ? matchPages : {
        index: matchPages.index
    };
    var info = tabs[req.params.info] ? req.params.info : "index";
    res.render("match_" + info, {
        route: info,
        match: match,
        tabs: tabs,
        title: "Match " + match.match_id + " - YASP"
    });
});

function sortDetails(match) {
    //converts hashes to arrays and sorts them
    match.players.forEach(function(player, i) {
        player=player.parsedPlayer;
        var t = [];
        for (var key in player.ability_uses) {
            var a = constants.abilities[key];
            if (a) {
                var ability = {};
                ability.img = a.img;
                ability.name = key;
                ability.val = player.ability_uses[key];
                ability.hero_hits = player.hero_hits[key];
                t.push(ability);
            }
            else {
                console.log(key);
            }
        }
        player.ability_uses = t;
        var u = [];
        for (var key in player.item_uses) {
            var b = constants.items[key];
            if (b) {
                var item = {};
                item.img = b.img;
                item.name = key;
                item.val = player.item_uses[key];
                u.push(item);
            }
            else {
                console.log(key);
            }
        }
        player.item_uses = u;
        var v = [];
        for (var key in player.damage) {
            var c = constants.hero_names[key];
            if (c) {
                var dmg = {};
                dmg.img = c.img;
                dmg.val = player.damage[key];
                dmg.kills = player.kills[key];
                v.push(dmg);
            }
            else {
                //console.log(key);
            }
        }
        player.damage = v;
        player.ability_uses.sort(function(a, b) {
            return b.val - a.val;
        });
        player.item_uses.sort(function(a, b) {
            return b.val - a.val;
        });
        player.damage.sort(function(a, b) {
            return b.val - a.val;
        });
    });
}

function mergeMatchData(match) {
    var heroes = match.parsed_data.heroes;
    //loop through all units
    //look up corresponding hero_id
    //hero if can find in constants
    //find player slot associated with that unit(hero_to_slot)
    //merge into player's primary unit
    //if not hero attempt to associate with a hero
    for (var key in heroes) {
        var primary = key;
        if (constants.hero_names[key]) {
            //is a hero
            //merging multiple heroes together, only occurs in ARDM
            var hero_id = constants.hero_names[key].id;
            var slot = match.parsed_data.hero_to_slot[hero_id];
            if (match.players[slot]) {
                var primary_id = match.players[slot].hero_id;
                primary = constants.heroes[primary_id].name;
                //build hero_ids for each player
                if (!match.players[slot].hero_ids) {
                    match.players[slot].hero_ids = [];
                }
                match.players[slot].hero_ids.push(hero_id);
            }
            else {
                console.log("couldn't find slot for hero id %s", hero_id);
            }
        }
        else {
            //is not a hero
            primary = getAssociatedHero(key, heroes);
        }
        if (key !== primary) {
            //merge the objects into primary, but not with itself
            mergeObjects(heroes[primary], heroes[key]);
        }
    }
    return match;
}

function getAssociatedHero(unit, heroes) {
    //assume all illusions belong to that hero
    if (unit.slice(0, "illusion_".length) === "illusion_") {
        unit = unit.slice("illusion_".length);
    }
    //attempt to recover hero name from unit
    if (unit.slice(0, "npc_dota_".length) === "npc_dota_") {
        //split by _
        var split = unit.split("_");
        //get the third element
        var identifiers = [split[2], split[2] + "_" + split[3]];
        identifiers.forEach(function(id) {
            //append to npc_dota_hero_, see if matches
            var attempt = "npc_dota_hero_" + id;
            if (heroes[attempt]) {
                unit = attempt;
            }
        });
    }
    return unit;
}

function generateGraphData(match) {
    //compute graphs
    var goldDifference = ['Gold'];
    var xpDifference = ['XP'];
    for (var i = 0; i < match.parsed_data.times.length; i++) {
        var goldtotal = 0;
        var xptotal = 0;
        match.parsed_data.players.forEach(function(elem, j) {
            if (match.players[j].isRadiant) {
                goldtotal += elem.gold[i];
                xptotal += elem.xp[i];
            }
            else {
                xptotal -= elem.xp[i];
                goldtotal -= elem.gold[i];
            }
        });
        goldDifference.push(goldtotal);
        xpDifference.push(xptotal);
    }
    var time = ["time"].concat(match.parsed_data.times);
    var data = {
        difference: [time, goldDifference, xpDifference],
        gold: [time],
        xp: [time],
        lh: [time]
    };
    match.parsed_data.players.forEach(function(elem, i) {
        var hero = constants.heroes[match.players[i].hero_id] || {};
        hero = hero.localized_name;
        data.gold.push([hero].concat(elem.gold));
        data.xp.push([hero].concat(elem.xp));
        data.lh.push([hero].concat(elem.lh));
    });
    //data for income chart
    var gold_reasons = [];
    var columns = [];
    var categories = [];
    var orderedPlayers = match.players.slice(0);
    orderedPlayers.sort(function(a, b) {
        return b.gold_per_min - a.gold_per_min;
    });
    orderedPlayers.forEach(function(player) {
        var hero = constants.heroes[player.hero_id];
        categories.push(hero.localized_name);
    });
    for (var key in constants.gold_reasons) {
        var reason = constants.gold_reasons[key];
        gold_reasons.push(reason);
        var col = [reason];
        orderedPlayers.forEach(function(player) {
            col.push(player.parsedPlayer.gold_reasons[key] || 0);
        });
        columns.push(col);
    }
    data.cats = categories;
    data.goldCols = columns;
    data.gold_reasons = gold_reasons;
    match.graphData = data;
    return match;
}
module.exports = matches;
