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
            var hero_id = constants.hero_names[key].id;
            var slot = match.parsed_data.hero_to_slot[hero_id];
            if (slot) {
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
        //append to npc_dota_hero_, see if matches
        var attempt = "npc_dota_hero_" + identifier;
        if (heroes[attempt]) {
            unit = attempt;
        }
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
        var hero = constants.heroes[match.players[i].hero_id].localized_name;
        data.gold.push([hero].concat(elem.gold));
        data.xp.push([hero].concat(elem.xp));
        data.lh.push([hero].concat(elem.lh));
    });
    match.graphData = data;
    return match;
}

function fillPlayerInfo(player, cb) {
    getMatchesByPlayer(player.account_id, function(err, matches) {
        if (err) {
            return cb(err);
        }
        var account_id = player.account_id;
        var counts = {};
        var heroes = {};
        player.teammates = [];
        player.calheatmap = {};
        for (var i = 0; i < matches.length; i++) {
            //add start time to data for cal-heatmap
            player.calheatmap[matches[i].start_time] = 1;
            //compute top heroes
            for (var j = 0; j < matches[i].players.length; j++) {
                var p = matches[i].players[j];
                if (p.account_id === account_id) {
                    //find the "main" player's id
                    var playerRadiant = isRadiant(p);
                    matches[i].player_win = (playerRadiant === matches[i].radiant_win);
                    matches[i].slot = j;
                    matches[i].player_win ? player.win += 1 : player.lose += 1;
                    player.games += 1;
                    if (!heroes[p.hero_id]) {
                        heroes[p.hero_id] = {
                            games: 0,
                            win: 0,
                            lose: 0
                        };
                    }
                    heroes[p.hero_id].games += 1;
                    matches[i].player_win ? heroes[p.hero_id].win += 1 : heroes[p.hero_id].lose += 1;
                }
            }
            //compute top teammates
            for (j = 0; j < matches[i].players.length; j++) {
                var tm = matches[i].players[j];
                if (isRadiant(tm) === playerRadiant) { //teammates of player
                    if (!counts[tm.account_id]) {
                        counts[tm.account_id] = {
                            account_id: tm.account_id,
                            win: 0,
                            lose: 0,
                            games: 0
                        };
                    }
                    counts[tm.account_id].games += 1;
                    matches[i].player_win ? counts[tm.account_id].win += 1 : counts[tm.account_id].lose += 1;
                }
            }
        }
        //convert teammate counts to array and filter
        for (var id in counts) {
            var count = counts[id];
            if (count.games >= 2) {
                player.teammates.push(count);
            }
        }
        player.matches = matches;
        player.heroes = heroes;
        fillPlayerNames(player.teammates, function(err) {
            cb(err);
        });
    });
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

function getMatchesByPlayer(account_id, cb) {
        var search = {};
        if (account_id) {
            search.players = {
                $elemMatch: {
                    account_id: account_id
                }
            };
        }
        db.matches.find(search, {
            sort: {
                match_id: -1
            }
        }, function(err, docs) {
            cb(err, docs);
        });
    }


module.exports = {
    fillPlayerNames: fillPlayerNames,
    getMatchesByPlayer: getMatchesByPlayer,
    mergeMatchData: mergeMatchData,
    generateGraphData: generateGraphData,
    fillPlayerInfo: fillPlayerInfo
}