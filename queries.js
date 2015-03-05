var utility = require('./utility');
var db = require('./db');
var async = require('async');
var redis = require('./redis').client;
var constants = require('./constants.json');
var mode = utility.mode;
var mergeObjects = utility.mergeObjects;
var isRadiant = utility.isRadiant;
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
                        patchData(match);
                        sortDetails(match);
                        generateGraphData(match);
                        match.posData = match.players.map(function(p) {
                            var d = {
                                "obs": true,
                                "sen": true,
                                "pos": true,
                                "lane_pos": true
                            };
                            return generatePositionData(d, p.parsedPlayer);
                        });
                        match.players.forEach(function(p, ind) {
                            var lanes = [];
                            for (var i = 0; i < match.posData[ind].lane_pos.length; i++) {
                                var d = match.posData[ind].lane_pos[i];
                                for (var j = 0; j < d.value; j++) {
                                    lanes.push(constants.lanes[d.y][d.x]);
                                }
                            }
                            p.parsedPlayer.lane = mode(lanes);
                        });
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

function generatePositionData(d, p) {
    //d, a hash of keys to process
    //p, a player containing keys with values as position hashes
    for (var key in d) {
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
    }
    return d;
}

function patchData(match) {
    var schema = utility.getParseSchema();
    if (!match.parsed_data || !match.parsed_data.version || match.parsed_data.version <= 3) {
        //nonexistent or old data, blank it
        match.parsed_data = schema;
    }
    else if (match.parsed_data.version === 4) {
        //v4 data, patch it
        mergeMatchData(match);
        match.players.forEach(function(player, i) {
            var hero = constants.heroes[player.hero_id];
            var parsedHero = match.parsed_data.heroes[hero.name];
            var parseSlot = player.player_slot % (128 - 5);
            var parsedPlayer = match.parsed_data.players[parseSlot];
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
            /*
            parsedPlayer.pos = parsedPlayer.positions.map(function(p) {
                return {
                    x: p[0],
                    y: p[1],
                    value: 1
                };
            });
            //get the first 10 values for lane calc
            parsedPlayer.lane_pos = parsedPlayer.pos.slice(0, 10);
            */
            //ensure all fields are present
            mergeObjects(parsedPlayer, schema.players[i]);
        });
        match.parsed_data.chat.forEach(function(c) {
            c.key = c.text;
        });
    }
    match.players.forEach(function(player) {
        player.isRadiant = isRadiant(player);
        //mapping 0 to 0, 128 to 5, etc.
        var parseSlot = player.player_slot % (128 - 5);
        var p = match.parsed_data.players[parseSlot];
        p.neutral_kills = 0;
        p.tower_kills = 0;
        for (var key in p.kills) {
            if (key.indexOf("npc_dota_neutral") === 0) {
                p.neutral_kills += p.kills[key];
            }
            if (key.indexOf("_tower") !== -1) {
                p.tower_kills += p.kills[key];
            }
        }
        //lane efficiency: divide 10 minute gold by static amount based on standard creep spawn
        p.lane_efficiency = (p.gold[10] || 0) / (43 * 60 + 48 * 20 + 74 * 2);
        player.parsedPlayer = p;
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
    /*
    //client side
    //todo implement query builder ui
    //don't use datatables ajax options, just submit the request via jquery and get back array, render table based on that data
    //client options should include:
    //default all games
    //filter: specific player(s)?
    //filter: specific hero was played by me, was on my team, was against me, was in the game
    //filter: specific game modes
    //filter: specific patches
    //filter: specific regions
    //filter: detect no stats recorded (algorithmically)
    //filter: significant game modes only    
    //filter: player's max gold advantage > n
    //report w/l for each filter, relative to which player?  only defined if user query contained account id?
    //client calls api, which processes a maximum number of matches (currently 10, parsed matches are really big and we dont want to spend massive bandwidth!)
    //can we increase the limit depending on the options passed?  if a user requests just a field or two we can return more
    //use advquery function as a wrapper around db.matches.find to do processing that mongo can't
    */
    //select, a mongodb search hash
    //options, a mongodb/monk options hash
function advQuery(select, options, cb) {
    /*
    //server side
    //we want to be able to specify:
    //selection condition(s)
    //fields to return (as a hash)
    //check select.keys to see if user requested special conditions
    //check options.fields.keys to see if user requested special fields
    //options, do a LOT of indexes on the parsed data to enable mongo lookup
    //or post-process it in js
    //fields (projection)
    //limit
    //skip
    //sort (but sorts are probably best done in js)

    //if selecting by account_id, we project only that user in players array
    //options.fields["players.$"] = 1;
    //we also compute winrate if this is defined
    //var wins = 0
    //var wins = null;
*/
    var wins = null;
    db.matches.find(select, options, function(err, matches) {
        if (err) {
            cb(err);
        }
        //iterate and compute
        //filter and send through aggregator?
        var results = {
            wins: wins,
            data: matches
        };
        cb(err, results);
    });
}

function aggregator(fields, matches) {
    var types = {
        "start_time": function(key, m, p) {
            agg(key, m.start_time);
        },
        "duration": function(key, m, p) {
            agg(key, m.duration);
        },
        "gold_per_min": function(key, m, p) {
            agg(key, p.gold_per_min);
        },
        "hero_damage": function(key, m, p) {
            agg(key, p.hero_damage);
        },
        "tower_damage": function(key, m, p) {
            agg(key, p.tower_damage);
        },
        "kills": function(key, m, p) {
            agg(key, p.kills);
        },
        "deaths": function(key, m, p) {
            agg(key, p.deaths);
        },
        "assists": function(key, m, p) {
            agg(key, p.assists);
        },
        //ward positions
        "obs": function(key, m, p) {
            utility.mergeObjects(aggData.obs.counts, p.parsedPlayer.obs);
        },
        "sen": function(key, m, p) {
            utility.mergeObjects(aggData.sen.counts, p.parsedPlayer.sen);
        },
        //lifetime rune counts
        "runes": function(key, m, p) {
            utility.mergeObjects(aggData.runes.counts, p.parsedPlayer.runes);
        },
        //lifetime item uses
        "item_uses": function(key, m, p) {
            utility.mergeObjects(aggData.item_uses.counts, p.parsedPlayer.item_uses);
        },
        //selected list of consumables (sum,min,max,avg, n), wards, tps
        "ward_observer": function(key, m, p) {
            agg(key, p.parsedPlayer.item_uses.ward_observer);
        },
        "ward_sentry": function(key, m, p) {
            agg(key, p.parsedPlayer.item_uses.ward_sentry);
        },
        "hero_id": function(key, m, p) {
            agg(key, p.hero_id);
        },
        "hero_wins": function(key, m, p) {
            agg(key, (isRadiant(p) === m.radiant_win) ? p.hero_id : undefined);
        },
        "match": function(key, m, p) {
            agg(key, m.match_id);
        },
        "match_wins": function(key, m, p) {
            agg(key, (isRadiant(p) === m.radiant_win) ? m.match_id : undefined);
        }
    };
    //todo
    //Grouping of heroes played(by valve groupings / primary attribute)
    //item timings
    //Chat(ggs called / messages, Swearing / profanity analysis)
    //custom queries: User selects user, spectre, radiance, get back array of radiance timings.
    var aggData = {};
    for (var key in types) {
        aggData[key] = {
            sum: 0,
            min: Number.MAX_VALUE,
            max: 0,
            n: 0,
            counts: {},
        };
    }

    function agg(key, value) {
        //todo handle numerical values or hashes
        var m = aggData[key];
        if (!m.counts[value]) {
            m.counts[value] = 0;
        }
        m.counts[value] += 1;
        m.sum += (value || 0);
        m.min = (value < m.min) ? value : m.min;
        m.max = (value > m.max) ? value : m.max;
        m.n += (typeof value === "undefined") ? 0 : 1;
    }
    for (var i = 0; i < matches.length; i++) {
        var m = matches[i];
        patchData(m);
        var p = m.players[0];
        for (var key in types) {
            //todo accept a hash of types and only aggregate those?
            types[key](key, m, p);
        }
    }
    return aggData;
}

function filter(type, matches) {
    var filtered = [];
    //todo implement filters based on type
    for (var i = 0; i < matches.length; i++) {
        if (constants.modes[matches[i].game_mode].balanced) {
            filtered.push(matches[i]);
        }
    }
    return filtered;
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
            parsed_data: 1,
            "players.$": 1
        }
    }, function(err, matches) {
        if (err) {
            return cb(err);
        }
        player.radiantMap = {}; //map whether the this player was on radiant for a particular match for efficient lookup later
        var calheatmap = {};
        for (var i = 0; i < matches.length; i++) {
            var m = matches[i];
            var p = m.players[0];
            player.radiantMap[m.match_id] = isRadiant(p);
            m.player_win = (isRadiant(p) === m.radiant_win); //did the player win?
            calheatmap[m.start_time] = 1;
        }
        var arr = Array.apply(null, new Array(120)).map(Number.prototype.valueOf, 0);
        var arr2 = Array.apply(null, new Array(120)).map(Number.prototype.valueOf, 0);
        player.heroes = {};
        for (var id in constants.heroes) {
            var obj = {
                hero_id: id,
                games: 0,
                win: 0,
                with_games: 0,
                with_win: 0,
                against_games: 0,
                against_win: 0
            };
            player.heroes[id] = obj;
        }
        player.win = 0;
        player.lose = 0;
        player.games = 0;
        var filtered = filter("balanced", matches);
        for (var i = 0; i < filtered.length; i++) {
            var f = filtered[i];
            var p = f.players[0];
            player.games += 1;
            f.player_win ? player.win += 1 : player.lose += 1;
            player.heroes[p.hero_id].games += 1;
            player.heroes[p.hero_id].win += f.player_win ? 1 : 0;
            //match times into buckets
            var mins = Math.floor(f.duration / 60) % 120;
            arr[mins] += 1;
            //gpms into buckets
            var gpm = Math.floor(f.players[0].gold_per_min / 10) % 120;
            arr2[gpm] += 1;
        }
        player.aggData = aggregator({}, filtered);
        var d = {
            "obs": true,
            "sen": true
        };
        player.obs = player.aggData.obs.counts;
        player.sen = player.aggData.sen.counts;
        player.posData = [generatePositionData(d, player)];
        player.heroes_arr = [];
        for (var key in player.heroes) {
            player.heroes_arr.push(player.heroes[key]);
        }
        player.heroes_arr.sort(function(a, b) {
            return b.games - a.games;
        });
        player.histogramData = {};
        player.histogramData.durations = arr;
        player.histogramData.gpms = arr2;
        player.histogramData.calheatmap = calheatmap;
        matches.sort(function(a, b) {
            return b.match_id - a.match_id;
        });
        player.matches = matches;
        //require('fs').writeFileSync("./output.json", JSON.stringify(player.aggData));
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

function computeStatistics(player, cb) {
    var counts = {};
    db.matches.find({
        'players.account_id': player.account_id
    }, {
        fields: {
            "players.account_id": 1,
            "players.hero_id": 1,
            match_id: 1,
            radiant_win: 1
        }
    }, function(err, docs) {
        if (err) {
            return cb(err);
        }
        //console.log(player.heroes);
        for (var i = 0; i < docs.length; i++) {
            var match = docs[i];
            var playerRadiant = player.radiantMap[match.match_id];
            for (var j = 0; j < match.players.length; j++) {
                var tm = match.players[j];
                var tm_hero = tm.hero_id;
                if (isRadiant(tm) === playerRadiant) {
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
                    if (tm_hero) {
                        player.heroes[tm_hero].with_games += 1;
                        player.heroes[tm_hero].with_win += (playerRadiant === match.radiant_win) ? 1 : 0;
                    }
                }
                else {
                    //count enemy heroes
                    if (tm_hero) {
                        player.heroes[tm_hero].against_games += 1;
                        player.heroes[tm_hero].against_win += (playerRadiant === match.radiant_win) ? 1 : 0;
                    }
                }
            }
        }
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
    fillPlayerMatches: fillPlayerMatches,
    fillPlayerNames: fillPlayerNames,
    getRatingData: getRatingData,
    getSets: getSets,
    prepareMatch: prepareMatch,
    advQuery: advQuery
};