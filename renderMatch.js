var utility = require('./utility');
var mergeObjects = utility.mergeObjects;
var constants = require('./constants.json');
var sentiment = require('sentiment');

function renderMatch(match) {
    var schema = utility.getParseSchema();
    //make sure parsed_data has all fields
    match.parsed_data = match.parsed_data || schema;
    //make sure each player's parsedplayer has all fields
    match.players.forEach(function(p, i) {
        mergeObjects(p.parsedPlayer, schema.players[i]);
    });
    match.players.forEach(function(player, i) {
        //converts hashes to arrays and sorts them
        var p = player.parsedPlayer;
        var t = [];
        for (var key in p.ability_uses) {
            var a = constants.abilities[key];
            if (a) {
                var ability = {};
                ability.img = a.img;
                ability.name = key;
                ability.val = p.ability_uses[key];
                ability.hero_hits = p.hero_hits[key];
                t.push(ability);
            }
            else {
                console.log(key);
            }
        }
        t.sort(function(a, b) {
            return b.val - a.val;
        });
        p.ability_uses_arr = t;
        var u = [];
        for (var key in p.item_uses) {
            var b = constants.items[key];
            if (b) {
                var item = {};
                item.img = b.img;
                item.name = key;
                item.val = p.item_uses[key];
                u.push(item);
            }
            else {
                console.log(key);
            }
        }
        u.sort(function(a, b) {
            return b.val - a.val;
        });
        p.item_uses_arr = u;
        var v = [];
        for (var key in p.damage) {
            var c = constants.hero_names[key];
            if (c) {
                var dmg = {};
                dmg.img = c.img;
                dmg.val = p.damage[key];
                dmg.kills = p.kills[key];
                v.push(dmg);
            }
            else {
                //console.log(key);
            }
        }
        v.sort(function(a, b) {
            return b.val - a.val;
        });
        p.damage_arr = v;
        //filter interval data to only be >0
        if (p.times) {
            var intervals = ["lh", "gold", "xp", "times"];
            intervals.forEach(function(key) {
                p[key] = p[key].filter(function(el, i) {
                    return p.times[i] >= 0;
                });
            });
        }
    });
    match.chat_words = match.chat.map(function(c) {
        return c.key;
    }).join(' ');
    match.sentiment = sentiment(match.chat_words, {
        "report": -2,
        "bg": -1,
        "feed": -1,
        "noob": -1,
        "commend": 2,
        "ty": 1,
        "thanks": 1,
        "wp": 1,
        "end": -1,
        "garbage": -1,
        "trash": -1
    });
    match.graphData = generateGraphData(match);
    match.posData = match.players.map(function(p) {
        return p.parsedPlayer.posData;
    });
}

function generateGraphData(match) {
    //compute graphs
    var goldDifference = ['Gold'];
    var xpDifference = ['XP'];
    for (var i = 0; i < match.parsed_data.players[0].times.length; i++) {
        var goldtotal = 0;
        var xptotal = 0;
        match.players.forEach(function(elem, j) {
            var p = elem.parsedPlayer;
            if (elem.isRadiant) {
                goldtotal += p.gold[i];
                xptotal += p.xp[i];
            }
            else {
                xptotal -= p.xp[i];
                goldtotal -= p.gold[i];
            }
        });
        goldDifference.push(goldtotal);
        xpDifference.push(xptotal);
    }
    var time = ["time"].concat(match.parsed_data.players[0].times);
    var data = {
        difference: [time, xpDifference, goldDifference],
        gold: [time],
        xp: [time],
        lh: [time]
    };
    match.players.forEach(function(elem, i) {
        var p = elem.parsedPlayer;
        var hero = constants.heroes[elem.hero_id] || {};
        hero = hero.localized_name;
        data.gold.push([hero].concat(p.gold));
        data.xp.push([hero].concat(p.xp));
        data.lh.push([hero].concat(p.lh));
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
        var hero = constants.heroes[player.hero_id] || {};
        categories.push(hero.localized_name);
    });
    for (var key in constants.gold_reasons) {
        var reason = constants.gold_reasons[key].name;
        gold_reasons.push(reason);
        var col = [reason];
        orderedPlayers.forEach(function(player) {
            var g = player.parsedPlayer.gold_reasons;
            col.push(g[key] || 0);
        });
        columns.push(col);
    }
    data.cats = categories;
    data.goldCols = columns;
    data.gold_reasons = gold_reasons;
    return data;
}
module.exports = renderMatch;