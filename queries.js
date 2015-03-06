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
    //make old parsed data format fit, enrich each player with a parsedPlayer property
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
                //console.log("couldn't find slot for hero id %s", hero_id);
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

function advQuery(select, options, cb) {
    //todo implement this
    //api wants full matches back, but no aggregation
    //custom query wants some fields back, with aggregation on those fields
    //client options should include:
    //filter: specific player/specific hero id
    //filter: specific hero was played by me, was on my team, was against me, was in the game
    //filter: specific game modes
    //filter: specific patches
    //filter: specific regions
    //filter: detect no stats recorded (algorithmically)
    //filter: significant game modes only    
    //filter: player's max gold advantage > n
    //client calls api, which processes a maximum number of matches (currently 10, parsed matches are really big and we dont want to spend massive bandwidth!)
    //can we increase the limit depending on the options passed?  if a user requests just a field or two we can return more
    //use advquery function as a wrapper around db.matches.find to do processing that mongo can't
    //select, a mongodb search hash
    //options, a mongodb/monk options hash
    //server side, we want to be able to specify:
    //selection condition(s)
    //fields to return (as a hash)
    //CONSTRAINT: each match can only have a SINGLE player matching the condition in order to make winrate defined and aggregations to work!
    //therefore a specific player or hero MUST be defined if we want to aggregate!
    //or we can do it anyway, and just not use the data since it only applies to the first hero
    //check select.keys to see if user requested special conditions
    //check options.fields.keys to see if user requested special fields, aggregate the selected fields
    //we need to pass aggregator specific fields since not all fields may exist (since we projected)
    //we can do a LOT of indexes on the parsed data to enable mongo lookup, or post-process it in js
    //fields (projection)
    //limit
    //skip
    //sort (but sorts are probably best done in js)
    //if selecting by account_id or hero_id, we project only that user in players array
    //if (select["players.account_id"] || select["players.hero_id"]){options.fields["players.$"] = 1;}
    db.matches.find(select, options, function(err, matches) {
        if (err) {
            return cb(err);
        }
        //filter and send through aggregator?
        var results = {
            aggData: null,
            data: matches
        };
        cb(err, results);
    });
}

function aggregator(matches, fields) {
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
            agg(key, p.parsedPlayer.obs);
        },
        "sen": function(key, m, p) {
            agg(key, p.parsedPlayer.sen);
        },
        //lifetime rune counts
        "runes": function(key, m, p) {
            agg(key, p.parsedPlayer.runes);
        },
        //lifetime item uses
        "item_uses": function(key, m, p) {
            agg(key, p.parsedPlayer.item_uses);
        },
        //todo support queries for any item_uses
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
        "match_id": function(key, m, p) {
            agg(key, m.match_id);
        },
        "isRadiant": function(key, m, p) {
            agg(key, isRadiant(p));
        }
    };
    //todo aggregations
    //leaver status
    //lhs
    //denies
    //xpm
    //hero healing
    //cluster
    //first_blood_time
    //lobby_type
    //game_mode
    //stuns
    //lifetime lane counts
    //kill counts
    //buyback counts
    //lifetime gold/xp reasons
    //lifetime ability uses/hero hits
    //define constant skillshots
    //Grouping of heroes played(by valve groupings / primary attribute)
    //Chat(ggs called / messages, Swearing / profanity analysis)
    //item timings, but this is an array!  can't look up item, so this could be a very slow query
    //todo make parser store first build time for each item?
    //custom queries: User selects user, spectre, radiance, get back array of radiance timings.
    fields = fields || types;
    //if not defined, do everything
    var aggData = {};
    for (var type in fields) {
        aggData[type] = {
            sum: 0,
            min: Number.MAX_VALUE,
            max: 0,
            n: 0,
            counts: {},
        };
    }

    function agg(key, value) {
        var m = aggData[key];
        if (typeof value === "object") {
            utility.mergeObjects(m.counts, value);
        }
        else {
            if (!m.counts[value]) {
                m.counts[value] = 0;
            }
            m.counts[value] += 1;
            m.sum += (value || 0);
            m.min = (value < m.min) ? value : m.min;
            m.max = (value > m.max) ? value : m.max;
            m.n += (typeof value === "undefined") ? 0 : 1;
        }
    }
    for (var i = 0; i < matches.length; i++) {
        var m = matches[i];
        //select the first player only, projection means only the desired player will be included
        var p = m.players[0];
        for (var type in fields) {
            types[type](type, m, p);
        }
    }
    return aggData;
}

function filter(type, matches) {
    var filtered = [];
    for (var i = 0; i < matches.length; i++) {
        //todo allow boolean logic (AND OR filters)
        //and can be implemented by applying filters in series
        if (type === "balanced") {
            if (constants.modes[matches[i].game_mode].balanced) {
                filtered.push(matches[i]);
            }
        }
        else if (type === "win") {
            if (isRadiant(matches[i].players[0]) === matches[i].radiant_win) {
                filtered.push(matches[i]);
            }
        }
        else {
            filtered.push(matches[i]);
        }
    }
    return filtered;
}

function fillPlayerMatches(player, constants, matchups, cb) {
    console.time('db');
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
        console.timeEnd('db');
        if (err) {
            return cb(err);
        }
        console.time('patch');
        for (var i = 0; i < matches.length; i++) {
            patchData(matches[i]);
        }
        console.timeEnd('patch');
        console.time('filter');
        var balanced = filter("balanced", matches);
        var balanced_win_matches = filter("win", balanced);
        console.timeEnd('filter');
        console.time('agg');
        player.aggData_all = aggregator(matches);
        player.aggData = aggregator(balanced);
        player.aggData_win = aggregator(balanced_win_matches);
        console.timeEnd('agg');
        console.time('post');
        var radiantMap = {}; //map whether the this player was on radiant for a particular match for efficient lookup later when doing teammates/matchups
        for (var i = 0; i < matches.length; i++) {
            var m = matches[i];
            var p = m.players[0];
            radiantMap[m.match_id] = isRadiant(p);
            m.player_win = (isRadiant(p) === m.radiant_win); //did the player win?
        }
        player.win = player.aggData_win.hero_id.n;
        player.lose = player.aggData.hero_id.n - player.aggData_win.hero_id.n;
        player.games = player.aggData.hero_id.n;
        player.obs = player.aggData.obs.counts;
        player.sen = player.aggData.sen.counts;
        var d = {
            "obs": true,
            "sen": true
        };
        player.posData = [generatePositionData(d, player)];
        player.heroes = {};
        for (var hero_id in constants.heroes) {
            var obj = {
                hero_id: hero_id,
                games: player.aggData.hero_id.counts[hero_id] || 0,
                win: player.aggData_win.hero_id.counts[hero_id] || 0,
                with_games: 0,
                with_win: 0,
                against_games: 0,
                against_win: 0
            };
            player.heroes[hero_id] = obj;
        }
        //make a sorted array for top heroes list
        player.heroes_arr = [];
        for (var key in player.heroes) {
            player.heroes_arr.push(player.heroes[key]);
        }
        player.heroes_arr.sort(function(a, b) {
            return b.games - a.games;
        });
        //temp function to generate bar charts, next version of c3 should support histograms from counts
        function generateHistogramData(counts, scalef, max) {
            var arr = Array.apply(null, new Array(max)).map(Number.prototype.valueOf, 0);
            Object.keys(counts).forEach(function(key) {
                var bucket = Math.round(Number(key) * scalef) % max;
                arr[bucket] += counts[key];
            });
            return arr;
        }
        player.histogramData = {};
        player.histogramData.durations = generateHistogramData(player.aggData.duration.counts, 1 / 60, 120);
        player.histogramData.gpms = generateHistogramData(player.aggData.gold_per_min.counts, 0.1, 120);
        player.histogramData.calheatmap = player.aggData_all.start_time.counts;
        matches.sort(function(a, b) {
            return b.match_id - a.match_id;
        });
        player.matches = matches;
        console.timeEnd('post');
        //require('fs').writeFileSync("./output.json", JSON.stringify(player.aggData));
        if (matchups) {
            console.time('matchups');
            computeMatchups(player, radiantMap, function(err) {
                console.timeEnd('matchups');
                cb(err);
            });
        }
        else {
            cb(err);
        }
    });
}

function computeMatchups(player, radiantMap, cb) {
    //compute stats that require iteration through all players in a match
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
        for (var i = 0; i < docs.length; i++) {
            var match = docs[i];
            var playerRadiant = radiantMap[match.match_id];
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