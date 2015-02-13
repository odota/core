var utility = require('./utility');
var db = require('./db');
var async = require('async');
var redis = require('./redis').client;

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

function fillPlayerNames(players, cb) {
    async.mapSeries(players, function(player, cb) {
        console.log("querying for player %s", player.account_id);
        db.players.findOne({
            account_id: player.account_id
        }, function(err, dbPlayer) {
            console.log("got result for player %s", player.account_id);
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
            if (utility.isRadiant(tm) === playerRadiant) {
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
        },
        sort: {
            match_id: -1
        }
    }, function(err, matches) {
        if (err) {
            cb(err);
        }
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
        player.heroes = [];
        for (var i = 0; i < matches.length; i++) {
            var p = matches[i].players[0];
            player.radiantMap[matches[i].match_id] = utility.isRadiant(p);
            matches[i].player_win = (utility.isRadiant(p) === matches[i].radiant_win); //did the player win?
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
        for (var id in heroes) {
            player.heroes.push(heroes[id]);
        }
        player.heroes.sort(function(a, b) {
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

function getRatingData(req, cb) {
    if (!req.user){
        return cb(null);
    }
    var account_id = req.user.account_id;
    async.parallel({
        "bots": function(cb) {
            redis.get("bots", function(err, bots) {
                bots = JSON.parse(bots);
                //sort list of bots descending, but > 200 go to end
                bots.sort(function(a, b) {
                    if (a.friends > 200) {
                        return 1;
                    }
                    if (b.friends > 200) {
                        return -1;
                    }
                    return (b.friends - a.friends);
                });
                cb(err, bots);
            });
        },
        "ratingPlayers": function(cb) {
            redis.get("ratingPlayers", function(err, rps) {
                cb(err, JSON.parse(rps));
            });
        },
        "ratings": function(cb) {
            db.ratings.find({
                    account_id: account_id
                }, {
                    sort: {
                        match_id: 1
                    }
                },
                function(err, docs) {
                    cb(err, docs);
                });
        }
    }, function(err, results) {
        cb(err, results);
    });
}

module.exports = {
    fillPlayerNames: fillPlayerNames,
    mergeMatchData: mergeMatchData,
    generateGraphData: generateGraphData,
    computeStatistics: computeStatistics,
    fillPlayerMatches: fillPlayerMatches,
    getRatingData: getRatingData
};