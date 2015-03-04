var utility = require('./utility');
var db = require('./db');
var async = require('async');
var redis = require('./redis').client;
var constants = require('./constants.json');
var mode = utility.mode;
var mergeObjects = utility.mergeObjects;
var config = require("./config");
//readies a match for display
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
                    return cb(new Error("match not found"));
                }
                else {
                    fillPlayerNames(match.players, function(err) {
                        if (err) {
                            return cb(err);
                        }
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
                                    parsedPlayer.kills_log = parsedHero.herokills;
                                    parsedPlayer.kills = parsedHero.kills;
                                    parsedPlayer.pos = parsedPlayer.positions || [];
                                    parsedPlayer.obs = {};
                                    parsedPlayer.sen = {};
                                    parsedPlayer.runes = {};
                                    //old format didn't translate coordinates
                                    parsedPlayer.pos = parsedPlayer.pos.map(function(p) {
                                        return {
                                            x: p[0],
                                            y: p[1],
                                            value: 1
                                        };
                                    });
                                    //get the first 10 values for lane calc
                                    parsedPlayer.lane_pos = parsedPlayer.pos.slice(0, 10);
                                });
                                match.parsed_data.chat.forEach(function(c) {
                                    c.key = c.text;
                                });
                            }
                            match.posData = [];
                            match.players.forEach(function(player) {
                                player.isRadiant = utility.isRadiant(player);
                                //mapping 0 to 0, 128 to 5, etc.
                                var parseSlot = player.player_slot % (128 - 5);
                                var p = match.parsed_data.players[parseSlot];
                                //generate position data from hashes
                                var keys = ["obs", "sen", "pos", "lane_pos"];
                                var d = {};
                                keys.forEach(function(key) {
                                    var t = [];
                                    for (var x in p[key]) {
                                        for (var y in p[key][x]) {
                                            t.push({
                                                x: Number(x) - 64,
                                                y: 127 - (Number(y) - 64),
                                                value: p[key][x][y]
                                            });
                                        }
                                    }
                                    d[key] = t;
                                });
                                match.posData.push(d);
                                var lanes = d.lane_pos.map(function(p) {
                                    //y first, then x due to array of arrays structure
                                    return constants.lanes[p.y][p.x];
                                });
                                p.lane = mode(lanes);
                                player.parsedPlayer = p;
                            });
                            sortDetails(match);
                            generateGraphData(match);
                        }
                        //Add to cache if we have parsed data
                        if (match.parsed_data && config.NODE_ENV !== "development") {
                            redis.setex(key, 86400, JSON.stringify(match));
                        }
                        return cb(err, match);
                    });
                }
            });
        }
    });
}

function sortDetails(match) {
    //converts hashes to arrays and sorts them
    match.players.forEach(function(player, i) {
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
        p.damage_arr = v;
        t.sort(function(a, b) {
            return b.val - a.val;
        });
        u.sort(function(a, b) {
            return b.val - a.val;
        });
        v.sort(function(a, b) {
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
    var time = ["time"].concat(match.parsed_data.times);
    var data = {
        difference: [time, goldDifference, xpDifference],
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
        var hero = constants.heroes[player.hero_id];
        categories.push(hero.localized_name);
    });
    for (var key in constants.gold_reasons) {
        var reason = constants.gold_reasons[key].name;
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

function getSets(cb) {
    async.parallel({
        "bots": function(cb) {
            redis.get("bots", function(err, bots) {
                bots = JSON.parse(bots || "[]");
                //sort list of bots descending, but full bots go to end
                bots.sort(function(a, b) {
                    var threshold = 100;
                    if (a.friends > threshold) {
                        return 1;
                    }
                    if (b.friends > threshold) {
                        return -1;
                    }
                    return (b.friends - a.friends);
                });
                cb(err, bots);
            });
        },
        "ratingPlayers": function(cb) {
            redis.get("ratingPlayers", function(err, rps) {
                cb(err, JSON.parse(rps || "{}"));
            });
        },
        "trackedPlayers": function(cb) {
            redis.get("trackedPlayers", function(err, tps) {
                cb(err, JSON.parse(tps || "{}"));
            });
        }
    }, function(err, results) {
        cb(err, results);
    });
}

function getRatingData(account_id, cb) {
        db.ratings.find({
            account_id: account_id
        }, {
            sort: {
                time: -1
            }
        }, function(err, docs) {
            cb(err, docs);
        });
    }
    //client side
    //todo implement query builder ui
    //don't use datatables ajax options, just submit the request via jquery and get back array, render table based on that data
    //client options should include:
    //default all games
    //filter: specific players
    //filter: specific hero was played by me, was on my team, was against me, was in the game
    //filter: specific game modes
    //filter: specific patches
    //filter: specific regions
    //gold advantage/disadvantage
    //report w/l for each filter, relative to who?
    //client calls api, which processes a maximum number of matches (currently 10, parsed matches are really big and we dont want to spend massive bandwidth!)
    //can we increase the limit depending on the options passed?  if a user requests just a field or two we can return more
    //use advquery function as a wrapper around db.matches.find to do processing that mongo can't
function advQuery(select, options, cb) {
    //if passed a specific player, should we project only that user in players array?
    /*
        //return only that player
        project["players.$"] = 1;
    */
    //select, a mongodb search hash
    //options, a mongodb/monk options hash
    //options.advQuery, a string containing a type of advanced query to do
    //fields (projection)
    //limit
    //skip
    //sort (but sorts are probably best done in js)
    //given a query, does post-processing on returned array of matches
    //if no post-processing needed, just use mongo's array
    //adv query returns an object with {summary:{},data:[]}
    //player pages should use this function to generate the necessary data
    
    /*
    There are two types of queries, ones that are predefined by YASP and we build something with the data, like a histogram, or nick's ward map, and ones that users build using some custom UI.
    A key difference between automatic and manual queries is that automatic queries can occur on the server side prior to rendering data back to the user. 
    Custom queries require hitting an API endpoint and sending back results.

    Examples of automatic queries (We already build histograms of match duration and GPM)
    select user, gpm, gets back array of gpms, build a histogram with it. Could also report numerical summaries.
    select user, match duration, same as above
    select user, runes, gets back array of hashes of counts by rune type.
    select user, Kills/Deaths/Assists, get back array of hashes of counts for each
    consumables avg/cumulative
    item timings, for each item, hero?
    HD/TD/HH (histograms)
    Chat (ggs called/messages, Swearing/profanity analysis)
    Grouping of heroes played (by valve groupings/primary attribute)
    @nickhh 's idea, select user, obs, get back array of hashes of x,y,value, iterate through all of them, sum the totals, build a heatmap.

    Examples of custom queries:
    User selects user, spectre, radiance, get back array of radiance timings.

    After the result of an advanced query, we want two things back:
    returning the full array of values (with this we can display a table, or build a histogram)
    returning the min/max/avg/sum (with this we can display a numerical summary of that data set)
    Optionally, we also return some metric such as win/loss so we can get a winrate for each particular query.

    Part 1 is building the functions to return these desired results for some given query.
    Part 2 involves building a UI to allow users to build custom queries, then use the same functions for data.

    Sorting: As long as the result set size is under 16MB (MongoDB's maximum) we can sort/filter on JS side (which is better since it doesn't require an index anyway).
    Filtering: detect no stats recorded (algorithmically), significant game modes only
    */
    db.matches.find(select, options, function(err, docs) {
        if (err) {
            cb(err);
        }
        //returns results in {summary:{},data:[]} format
        var results = {
            summary: {},
            data: docs
        };
        cb(err, results);
    });
}
module.exports = {
    fillPlayerNames: fillPlayerNames,
    getRatingData: getRatingData,
    getSets: getSets,
    prepareMatch: prepareMatch,
    advQuery: advQuery
};