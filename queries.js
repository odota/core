var utility = require('./utility');
var db = utility.db;
var isRadiant = utility.isRadiant;
var async = require('async');

function mergeObjects(merge, val) {
    for (var attr in val) {
        if (val[attr].constructor === Array) {
            merge[attr] = merge[attr].concat(val[attr]);
        }
        else if (typeof val[attr] === "object") {
            mergeObjects(merge[attr], val[attr]);
        }
        else {
            //does property exist?
            if (!merge[attr]) {
                merge[attr] = val[attr];
            }
            else {
                merge[attr] += val[attr];
            }
        }
    }
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
        var val = heroes[key];
        var primary = key;
        if (constants.hero_names[key]) {
            //is a hero
            //merging multiple heroes together, only occurs in ARDM
            //doesn't work for 1v1, but ARDM is only played with 10 players
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
            mergeObjects(heroes[primary], val);
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
        var identifier = split[2];
        if (split[2] === "shadow" && split[3] === "shaman") {
            identifier = "shadow_shaman";
        }
        if (split[2] === "witch" && split[3] === "doctor") {
            identifier = "witch_doctor";
        }
        //append to npc_dota_hero_, see if matches
        var attempt = "npc_dota_hero_" + identifier;
        if (heroes[attempt]) {
            unit = attempt;
        }
    }
    return unit;
}

function generateGraphData(match, constants) {
    var oneVone = (match.players.length === 2);
    if (oneVone) {
        //rebuild parsed data players array if 1v1 match
        match.parsed_data.players = [match.parsed_data.players[0], match.parsed_data.players[5]];
    }
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
        var hero = constants.heroes[match.players[i].hero_id].localized_name + (oneVone ? " - " + match.players[i].personaname : "");
        data.gold.push([hero].concat(elem.gold));
        data.xp.push([hero].concat(elem.xp));
        data.lh.push([hero].concat(elem.lh));
        var key = constants.heroes[match.players[i].hero_id].name;

    });

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
        var col = [reason];
        orderedPlayers.forEach(function(player) {
            var hero = constants.heroes[player.hero_id];
            var parsedHero = match.parsed_data.heroes[hero.name];
            col.push(parsedHero.gold_log[key] || 0);
        });
        columns.push(col);
        gold_reasons.push(reason);
    }
    match.goldBreakdown = {
        bindto: "#chart-gold-breakdown",
        data: {
            columns: columns,
            type: 'bar',
            order: null,
            groups: [
                //gold_reasons
            ]
        },
        bar: {
            width: {
                ratio: 1
            }
        },
        axis: {
            x: {
                type: "category",
                categories: categories
            }
        }
    };
    match.graphData = data;
    return match;
}

function fillPlayerNames(players, cb) {
    async.mapSeries(players, function(player, cb) {
        db.players.findOne({
            account_id: player.account_id
        }, function(err, dbPlayer) {
            if (dbPlayer) {
                for (var prop in dbPlayer) {
                    player[prop] = dbPlayer[prop];
                }
            }
            cb(err);
        });
    }, function(err) {
        cb(err);
    });
}

function computeStatistics(player, cb) {
    var playerMatches = player.matches;
    db.matches.find({
        'players.account_id': player.account_id
    }, {
        sort: {
            match_id: -1
        }
    }, function(err, matches) {
        if (err) {
            return cb(err);
        }
        //array to store match durations in minutes
        var arr = Array.apply(null, new Array(120)).map(Number.prototype.valueOf, 0);
        var counts = {};
        var against = {};
        var together = {};
        for (var i = 0; i < matches.length; i++) {
            var mins = Math.floor(matches[i].duration / 60) % 120;
            arr[mins] += 1;
            for (var j = 0; j < matches[i].players.length; j++) {
                var tm = matches[i].players[j];
                var tm_hero = tm.hero_id;
                if (utility.isRadiant(tm) === playerMatches[i].playerRadiant) {
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
                    playerMatches[i].player_win ? counts[tm.account_id].win += 1 : counts[tm.account_id].lose += 1;
                    //count teammate heroes
                    if (!together[tm_hero]) {
                        together[tm_hero] = {
                            games: 0,
                            win: 0,
                            lose: 0
                        };
                    }
                    together[tm_hero].games += 1;
                    playerMatches[i].player_win ? together[tm_hero].win += 1 : together[tm_hero].lose += 1;
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
                    playerMatches[i].player_win ? against[tm_hero].win += 1 : against[tm_hero].lose += 1;
                }
            }
        }
        player.durations = arr;
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

module.exports = {
    fillPlayerNames: fillPlayerNames,
    mergeMatchData: mergeMatchData,
    generateGraphData: generateGraphData,
    computeStatistics: computeStatistics
};