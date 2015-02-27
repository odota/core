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
    redis.get(id, function(err, reply) {
        if (!err && reply && false) {
            console.log("Cache hit for match " + id);
            req.match = JSON.parse(reply);
            return next(err);
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
                            if (match.parsed_data.version >= 5) {
                                //todo implement new function to process new format
                                //output in way to allowing using the same templates
                                //update old functions to output data properly
                                preprocess(match);
                            }
                            else {
                                mergeMatchData(match, constants);
                                generateGraphData(match, constants);
                                generatePositionData(match, constants);
                                sortDetails(match, constants);
                            }
                        }
                        //Add to cache if we have parsed data
                        if (match.parsed_data && process.env.NODE_ENV !== "development") {
                            redis.setex(id, 86400, JSON.stringify(match));
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
    var info = matchPages[req.params.info] ? req.params.info : "index";
    res.render("match_" + info, {
        route: info,
        match: match,
        tabs: matchPages,
        title: "Match " + match.match_id + " - YASP"
    });
});

function sortDetails(match, constants) {
    match.players.forEach(function(player, i) {
        var hero = constants.heroes[player.hero_id];
        var parsedHero = match.parsed_data.heroes[hero.name];
        player.abilityuses = [];
        for (var key in parsedHero.abilityuses) {
            var a = constants.abilities[key];
            if (a) {
                var ability = {};
                ability.img = a.img;
                ability.name = key;
                ability.val = parsedHero.abilityuses[key];
                ability.hero_hits = parsedHero.hero_hits[key];
                player.abilityuses.push(ability);
            }
            else {
                console.log(key);
            }
        }
        player.itemuses = [];
        for (var key in parsedHero.itemuses) {
            var b = constants.items[key];
            if (b) {
                var item = {};
                item.img = b.img;
                item.name = key;
                item.val = parsedHero.itemuses[key];
                player.itemuses.push(item);
            }
            else {
                console.log(key);
            }
        }
        player.damage = [];
        for (var key in parsedHero.damage) {
            var c = constants.hero_names[key];
            if (c) {
                var dmg = {};
                dmg.img = c.img;
                dmg.val = parsedHero.damage[key];
                dmg.kills = parsedHero.kills[key];
                player.damage.push(dmg);
            }
            else {
                //console.log(key);
            }
        }
        player.abilityuses.sort(function(a, b) {
            return b.val - a.val;
        });
        player.itemuses.sort(function(a, b) {
            return b.val - a.val;
        });
        player.damage.sort(function(a, b) {
            return b.val - a.val;
        });
    });
}

function mergeMatchData(match, constants) {
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

function generateGraphData(match, constants) {
    //compute graphs
    var goldDifference = ['Gold'];
    var xpDifference = ['XP'];
    for (var i = 0; i < match.parsed_data.times.length; i++) {
        var goldtotal = 0;
        var xptotal = 0;
        match.parsed_data.players.forEach(function(elem, j) {
            if (match.players[j].player_slot < 64) {
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
    //console.log(orderedPlayers);
    orderedPlayers.forEach(function(player) {
        var hero = constants.heroes[player.hero_id];
        categories.push(hero.localized_name);
    });
    for (var key in constants.gold_reasons) {
        var reason = constants.gold_reasons[key];
        gold_reasons.push(reason);
        var col = [reason];
        orderedPlayers.forEach(function(player) {
            var hero = constants.heroes[player.hero_id];
            var parsedHero = match.parsed_data.heroes[hero.name];
            col.push(parsedHero.gold_log[key] || 0);
        });
        columns.push(col);
    }
    data.cats = categories;
    data.goldCols = columns;
    data.gold_reasons = gold_reasons;
    match.graphData = data;
    return match;
}

function generatePositionData(match, constants) {
    match.parsed_data.players.forEach(function(elem, j) {
        //data might not exist
        elem.positions = elem.positions || [];
        //transform to 0-127 range, y=0 at top left
        elem.positions = elem.positions.map(function(p) {
            return [p[0] - 64, 127 - (p[1] - 64)];
        }).filter(function(p) {
            return p[0] >= 0 && p[1] >= 0;
        });
        var start = elem.positions.slice(0, 10);
        //median, alternate calculation
        //elem.lane = constants.lanes[start.sort(function(a,b){return a[1]-b[1]})[4][1]][start.sort(function(a,b){return a[0]-b[0]})[4][0]];
        var lanes = start.map(function(e) {
            //y first, then x due to array of arrays structure
            return constants.lanes[e[1]][e[0]];
        });
        //determine lane
        //console.log(lanes);
        elem.lane = mode(lanes);
    });
}
module.exports = matches;
