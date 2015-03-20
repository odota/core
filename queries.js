var utility = require('./utility');
var db = require('./db');
var async = require('async');
var redis = require('./redis').client;
var constants = require('./constants.json');
var mode = utility.mode;
var mergeObjects = utility.mergeObjects;
var isRadiant = utility.isRadiant;
var config = require("./config");
var sentiment = require('sentiment');
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
                        computeMatchData(match);
                        var schema = utility.getParseSchema();
                        //make sure parsed_data has all fields
                        match.parsed_data = match.parsed_data || schema;
                        //make sure each player's parsedplayer has all fields
                        match.players.forEach(function(p, i) {
                            mergeObjects(p.parsedPlayer, schema.players[i]);
                        });
                        renderMatch(match);
                        //Add to cache if status is parsed
                        if (match.parse_status === 2 && config.NODE_ENV !== "development") {
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
    //stores the resulting arrays in the keys of d
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

function computeMatchData(match) {
    //for aggregation, want undefined fields for invalids, aggregator counts toward n unless undefined
    //v4 matches need patching, patching produces v5 data with some undefined fields
    if (!match.parsed_data || !match.parsed_data.version || match.parsed_data.version < 4) {
        //console.log("parse data too old, nulling");
        match.parsed_data = null;
    }
    else if (match.parsed_data && match.parsed_data.version === 4) {
        //console.log("patching v4 data");
        patchLegacy(match);
    }
    else {
        //console.log("valid v5 data %s", match.parsed_data.version);
    }
    //add a parsedplayer property to each player, and compute more stats
    match.players.forEach(function(player, ind) {
        player.isRadiant = isRadiant(player);
        var p = {};
        if (match.parsed_data) {
            //mapping 0 to 0, 128 to 5, etc.
            var parseSlot = player.player_slot % (128 - 5);
            p = match.parsed_data.players[parseSlot];
            //filter meepo/meepo kills
            if (player.hero_id === 82) {
                p.kills_log = p.kills_log.filter(function(k) {
                    k.key !== "npc_dota_hero_meepo";
                });
            }
            p.neutral_kills = 0;
            p.tower_kills = 0;
            p.courier_kills = 0;
            for (var key in p.kills) {
                if (key.indexOf("npc_dota_neutral") === 0) {
                    p.neutral_kills += p.kills[key];
                }
                if (key.indexOf("_tower") !== -1) {
                    p.tower_kills += p.kills[key];
                }
                if (key.indexOf("courier") !== -1) {
                    p.courier_kills += p.kills[key];
                }
            }
            //lane efficiency: divide 10 minute gold by static amount based on standard creep spawn
            p.lane_efficiency = (p.gold[10] || 0) / (43 * 60 + 48 * 20 + 74 * 2);
            //convert position hashes to heatmap array of x,y,value
            var d = {
                "obs": true,
                "sen": true,
                //"pos": true,
                "lane_pos": true
            };
            p.posData = generatePositionData(d, p);
            //p.explore = p.posData.pos.length / 128 / 128;
            //compute lanes
            var lanes = [];
            for (var i = 0; i < p.posData.lane_pos.length; i++) {
                var dp = p.posData.lane_pos[i];
                for (var j = 0; j < dp.value; j++) {
                    lanes.push(constants.lanes[dp.y][dp.x]);
                }
            }
            if (lanes.length) {
                p.lane = mode(lanes);
                var lane_roles = {
                    "1": function(radiant) {
                        //bot
                        return radiant ? "Safe" : "Off";
                    },
                    "2": function(radiant) {
                        //mid
                        return "Mid";
                    },
                    "3": function(radiant) {
                        //top
                        return radiant ? "Off" : "Safe";
                    },
                    "4": function(radiant) {
                        //rjung
                        return "Jungle";
                    },
                    "5": function(radiant) {
                        //djung
                        return "Jungle";
                    }
                };
                p.lane_role = lane_roles[p.lane](player.isRadiant);
            }
            //compute hashes of purchase time sums and counts from logs
            p.purchase_time = {};
            p.purchase_time_count = {};
            for (var i = 0; i < p.purchase_log.length; i++) {
                var k = p.purchase_log[i].key;
                var time = p.purchase_log[i].time;
                if (!p.purchase_time[k]) {
                    p.purchase_time[k] = 0;
                    p.purchase_time_count[k] = 0;
                }
                p.purchase_time[k] += time;
                p.purchase_time_count[k] += 1;
            }
        }
        player.parsedPlayer = p;
    });
}

function renderMatch(match) {
    //build the chat
    match.chat = [];
    match.chat_words = [];
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
        p.chat.forEach(function(c) {
            c.slot = i;
            match.chat.push(c);
            match.chat_words.push(c.key);
        });
    });
    match.chat_words = match.chat_words.join(' ');
    match.sentiment = sentiment(match.chat_words, {
        "report": -2,
        "bg": -1,
        "feed": -1,
        "noob": -1,
        "commended": 2,
        "ty": 1,
        "thanks": 1,
        "wp": 1,
        "end": -1,
        "garbage": -1,
        "trash": -1
    });
    match.chat.sort(function(a, b) {
        return a.time - b.time;
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
            var g = player.parsedPlayer.gold_reasons || {};
            col.push(g[key] || 0);
        });
        columns.push(col);
    }
    data.cats = categories;
    data.goldCols = columns;
    data.gold_reasons = gold_reasons;
    return data;
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
    //currently api is using this
    //custom query wants some fields back, with aggregation on those fields
    //client options should include:
    //filter: specific player/specific hero id
    //filter: specific player was also in the game (use players.account_id with $and, but which player gets returned by projection?)
    //filter: specific hero was played by me, was on my team, was against me, was in the game
    //filter: specific game modes
    //filter: specific patches
    //filter: specific regions
    //filter: detect no stats recorded (algorithmically)
    //filter: significant game modes only    
    //client calls api, which processes a maximum number of matches (currently 10, parsed matches are really big and we dont want to spend massive bandwidth!)
    //can we increase the limit depending on the options passed?  if a user requests just a field or two we can return more
    //use advquery function as a wrapper around db.matches.find to do processing that mongo can't
    //select, a mongodb search hash
    //options, a mongodb/monk options hash
    //CONSTRAINT: each match can only have a SINGLE player matching the condition in order to make winrate defined and aggregations to work!
    //therefore a specific player or hero MUST be defined if we want to aggregate!
    //or we can do it anyway, and just not use the data since it only applies to the first hero
    //check select.keys to see if user requested special conditions
    //check options.fields.keys to see if user requested special fields, aggregate the selected fields
    //we need to pass aggregator specific fields since not all fields may exist (since we projected)
    //we can do indexes on the parsed data to enable mongo lookup, or post-process it in js
    //fields (projection), limit, skip, sort (but sorts are probably best done in js)
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
            agg(key, m.start_time, m);
        },
        "duration": function(key, m, p) {
            agg(key, m.duration, m);
        },
        "cluster": function(key, m, p) {
            agg(key, m.cluster, m);
        },
        "first_blood_time": function(key, m, p) {
            agg(key, m.first_blood_time, m);
        },
        "lobby_type": function(key, m, p) {
            agg(key, m.lobby_type, m);
        },
        "game_mode": function(key, m, p) {
            agg(key, m.game_mode, m);
        },
        "hero_id": function(key, m, p) {
            agg(key, p.hero_id, m);
        },
        "kills": function(key, m, p) {
            agg(key, p.kills, m);
        },
        "deaths": function(key, m, p) {
            agg(key, p.deaths, m);
        },
        "assists": function(key, m, p) {
            agg(key, p.assists, m);
        },
        "last_hits": function(key, m, p) {
            agg(key, p.last_hits, m);
        },
        "denies": function(key, m, p) {
            agg(key, p.denies, m);
        },
        "gold_per_min": function(key, m, p) {
            agg(key, p.gold_per_min, m);
        },
        "xp_per_min": function(key, m, p) {
            agg(key, p.xp_per_min, m);
        },
        "hero_damage": function(key, m, p) {
            agg(key, p.hero_damage, m);
        },
        "tower_damage": function(key, m, p) {
            agg(key, p.tower_damage, m);
        },
        "hero_healing": function(key, m, p) {
            agg(key, p.hero_healing, m);
        },
        "leaver_status": function(key, m, p) {
            agg(key, p.leaver_status, m);
        },
        "isRadiant": function(key, m, p) {
            agg(key, isRadiant(p), m);
        },
        "stuns": function(key, m, p) {
            agg(key, p.parsedPlayer.stuns, m);
        },
        "lane": function(key, m, p) {
            agg(key, p.parsedPlayer.lane, m);
        },
        "lane_role": function(key, m, p) {
            agg(key, p.parsedPlayer.lane_role, m);
        },
        //lifetime ward positions
        "obs": function(key, m, p) {
            agg(key, p.parsedPlayer.obs, m);
        },
        "sen": function(key, m, p) {
            agg(key, p.parsedPlayer.sen, m);
        },
        //lifetime rune counts
        "runes": function(key, m, p) {
            agg(key, p.parsedPlayer.runes, m);
        },
        //lifetime item uses
        "item_uses": function(key, m, p) {
            agg(key, p.parsedPlayer.item_uses, m);
        },
        //track sum of purchase times and counts to get average build time
        "purchase_time": function(key, m, p) {
            agg(key, p.parsedPlayer.purchase_time, m);
        },
        "purchase_time_count": function(key, m, p) {
            agg(key, p.parsedPlayer.purchase_time_count, m);
        },
        "purchase": function(key, m, p) {
            agg(key, p.parsedPlayer.purchase, m);
        },
        "kills_count": function(key, m, p) {
            agg(key, p.parsedPlayer.kills, m);
        },
        "gold_reasons": function(key, m, p) {
            agg(key, p.parsedPlayer.gold_reasons, m);
        },
        "xp_reasons": function(key, m, p) {
            agg(key, p.parsedPlayer.xp_reasons, m);
        },
        "ability_uses": function(key, m, p) {
            agg(key, p.parsedPlayer.ability_uses, m);
        },
        "hero_hits": function(key, m, p) {
            agg(key, p.parsedPlayer.hero_hits, m);
        },
        "chat_message_count": function(key, m, p) {
            if (p.parsedPlayer.chat) {
                agg(key, p.parsedPlayer.chat.length, m);
            }
        },
        "gg_count": function(key, m, p) {
            //count ggs
            if (p.parsedPlayer.chat) {
                agg(key, p.parsedPlayer.chat.filter(function(c) {
                    return c.key.indexOf("gg") === 0;
                }).length, m);
            }
        },
        "buyback_count": function(key, m, p) {
            if (p.parsedPlayer.buyback_log) {
                agg(key, p.parsedPlayer.buyback_log.length, m);
            }
        },
        "courier_kills": function(key, m, p) {
            agg(key, p.parsedPlayer.courier_kills, m);
        },
        "tower_kills": function(key, m, p) {
            agg(key, p.parsedPlayer.tower_kills, m);
        },
        "neutral_kills": function(key, m, p) {
            agg(key, p.parsedPlayer.neutral_kills, m);
        },
        "observer_uses": function(key, m, p) {
            if (p.parsedPlayer.item_uses) {
                agg(key, p.parsedPlayer.item_uses.ward_observer || 0, m);
            }
        },
        "sentry_uses": function(key, m, p) {
            if (p.parsedPlayer.item_uses) {
                agg(key, p.parsedPlayer.item_uses.ward_sentry || 0, m);
            }
        }
    };
    var aggData = {};
    fields = fields || types;
    for (var type in fields) {
        aggData[type] = {
            sum: 0,
            min: Number.MAX_VALUE,
            max: 0,
            max_match: null,
            n: 0,
            counts: {},
        };
    }
    for (var i = 0; i < matches.length; i++) {
        var m = matches[i];
        var p = m.players[0];
        for (var type in fields) {
            if (types[type]) {
                types[type](type, m, p);
            }
        }
    }
    return aggData;

    function agg(key, value, match) {
        var m = aggData[key];
        if (typeof value === "undefined") {
            return;
        }
        m.n += 1;
        if (typeof value === "object") {
            utility.mergeObjects(m.counts, value);
        }
        else {
            if (!m.counts[value]) {
                m.counts[value] = 0;
            }
            m.counts[value] += 1;
            m.sum += (value || 0);
            if (value < m.min) {
                m.min = value;
            }
            if (value > m.max) {
                m.max = value;
                m.max_match = match;
            }
        }
    }
}

function filter(matches, type) {
    var filtered = [];
    for (var i = 0; i < matches.length; i++) {
        if (type["balanced"]) {
            if (constants.modes[matches[i].game_mode].balanced && constants.lobbies[matches[i].lobby_type].balanced) {
                filtered.push(matches[i]);
            }
        }
        else if (type["win"]) {
            if (isRadiant(matches[i].players[0]) === matches[i].radiant_win) {
                filtered.push(matches[i]);
            }
        }
        else if (type["hero_id"]) {
            if (matches[i].players[0].hero_id === Number(type["hero_id"])) {
                filtered.push(matches[i]);
            }
        }
        else {
            filtered.push(matches[i]);
        }
    }
    return filtered;
}

function fillPlayerMatches(player, options, cb) {
    console.time('db');
    var account_id = player.account_id;
    db.matches.find({
        players: {
            $elemMatch: {
                account_id: account_id,
                hero_id: Number(options.hero_id) || {
                    $ne: null
                }
            }
        }
    }, {
        fields: {
            "players.$": 1,
            start_time: 1,
            match_id: 1,
            duration: 1,
            cluster: 1,
            radiant_win: 1,
            parse_status: 1,
            parsed_data: 1,
            first_blood_time: 1,
            lobby_type: 1,
            game_mode: 1
        }
    }, function(err, matches) {
        if (err) {
            console.log(err);
            return cb(err);
        }
        console.timeEnd('db');
        console.time('compute');
        for (var i = 0; i < matches.length; i++) {
            computeMatchData(matches[i]);
        }
        console.timeEnd('compute');
        console.time('filter');
        var balanced = filter(matches, {
            "balanced": 1
        });
        var balanced_win_matches = filter(balanced, {
            "win": 1
        });
        console.timeEnd('filter');
        console.time('agg');
        //todo we're currently displaying in the cal-heatmap only balanced mode matches.  do we want to do all?
        player.aggData_all = aggregator(matches, {
            "start_time": 1
        });
        player.aggData = aggregator(balanced);
        player.aggData_win = aggregator(balanced_win_matches, {
            "hero_id": 1
        });
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
        generatePositionData(d, player);
        player.posData = [d];
        matches.sort(function(a, b) {
            return b.match_id - a.match_id;
        });
        player.matches = matches;
        console.timeEnd('post');
        //require('fs').writeFileSync("./output.json", JSON.stringify(player.aggData));
        console.time("db2");
        var match_ids = balanced.map(function(m) {
            return m.match_id;
        });
        db.matches.find({
            match_id: {
                $in: match_ids
            }
            /*
            players: {
                $elemMatch: {
                    account_id: account_id,
                    hero_id: Number(options.hero_id) || {
                        $ne: null
                    }
                }
            }
            */
        }, {
            fields: {
                "players.account_id": 1,
                "players.hero_id": 1,
                "players.player_slot": 1,
                match_id: 1,
                radiant_win: 1,
                game_mode: 1,
                lobby_type: 1
            }
        }, function(err, docs) {
            if (err) {
                return cb(err);
            }
            console.timeEnd("db2");
            //compute stats that require iteration through all players in a match
            var teammates = {};
            player.heroes = {};
            for (var hero_id in constants.heroes) {
                var obj = {
                    hero_id: hero_id,
                    games: 0,
                    win: 0,
                    with_games: 0,
                    with_win: 0,
                    against_games: 0,
                    against_win: 0
                };
                player.heroes[hero_id] = obj;
            }
            for (var i = 0; i < docs.length; i++) {
                var match = docs[i];
                var playerRadiant = radiantMap[match.match_id];
                var player_win = (playerRadiant === match.radiant_win);
                for (var j = 0; j < match.players.length; j++) {
                    var tm = match.players[j];
                    var tm_hero = tm.hero_id;
                    if (isRadiant(tm) === playerRadiant) {
                        //count teammate players
                        if (!teammates[tm.account_id]) {
                            teammates[tm.account_id] = {
                                account_id: tm.account_id,
                                win: 0,
                                games: 0
                            };
                        }
                        teammates[tm.account_id].games += 1;
                        teammates[tm.account_id].win += player_win ? 1 : 0;
                        //count teammate heroes
                        if (tm_hero in player.heroes) {
                            if (tm.account_id === player.account_id) {
                                //console.log("self %s", tm_hero);
                                player.heroes[tm_hero].games += 1;
                                player.heroes[tm_hero].win += player_win ? 1 : 0;
                            }
                            else {
                                //console.log("teammate %s", tm_hero);
                                player.heroes[tm_hero].with_games += 1;
                                player.heroes[tm_hero].with_win += player_win ? 1 : 0;
                            }
                        }
                    }
                    else {
                        //count enemy heroes
                        if (tm_hero in player.heroes) {
                            //console.log("opp %s", tm_hero);
                            player.heroes[tm_hero].against_games += 1;
                            player.heroes[tm_hero].against_win += player_win ? 1 : 0;
                        }
                    }
                }
            }
            player.heroes_arr = [];
            for (var id in player.heroes) {
                var hc = player.heroes[id];
                player.heroes_arr.push(hc);
            }
            player.heroes_arr.sort(function(a, b) {
                return b.games - a.games;
            });
            player.teammates = [];
            for (var id in teammates) {
                var count = teammates[id];
                id = Number(id);
                if (id !== constants.anonymous_account_id && id !== player.account_id && count.games >= 3) {
                    player.teammates.push(count);
                }
            }
            player.teammates.sort(function(a, b) {
                return b.games - a.games;
            });
            console.time('teammate_lookup');
            fillPlayerNames(player.teammates, function(err) {
                console.timeEnd('teammate_lookup');
                cb(err);
            });
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
//deprecated v4 functions
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

function patchLegacy(match) {
    mergeMatchData(match);
    match.players.forEach(function(player, i) {
        var hero = constants.heroes[player.hero_id];
        var parsedHero = match.parsed_data.heroes[hero.name];
        var parseSlot = player.player_slot % (128 - 5);
        var parsedPlayer = match.parsed_data.players[parseSlot];
        //get the data from the old heroes hash
        parsedPlayer.purchase = parsedHero.itembuys;
        parsedPlayer.buyback_log = parsedPlayer.buybacks;
        parsedPlayer.ability_uses = parsedHero.abilityuses;
        parsedPlayer.item_uses = parsedHero.itemuses;
        parsedPlayer.gold_reasons = parsedHero.gold_log;
        parsedPlayer.xp_reasons = parsedHero.xp_log;
        parsedPlayer.damage = parsedHero.damage;
        parsedPlayer.hero_hits = parsedHero.hero_hits;
        parsedPlayer.purchase_log = parsedHero.timeline;
        parsedPlayer.kills_log = parsedHero.herokills;
        parsedPlayer.kills = parsedHero.kills;
        parsedPlayer.times = match.parsed_data.times;
        parsedPlayer.chat = [];
        //fill the chat for each player
        match.parsed_data.chat.forEach(function(c) {
            c.key = c.text;
            if (c.slot === parseSlot) {
                parsedPlayer.chat.push(c);
            }
        });
        //remove recipes
        /*
        parsedPlayer.purchase_log.forEach(function(p,i){
            if(p.key.indexOf("recipe_")===0){
                parsedPlayer.purchase_log.splice(i,1);
            }
        });
        */
        //console.log('completed %s', match.match_id, parseSlot, i);
    });
}