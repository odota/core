var db = require('./db');
var async = require('async');
var redis = require('./redis').client;
var constants = require('./constants.json');
var config = require("./config");
var display = require('./display');
var utility = require('./utility');
var isRadiant = utility.isRadiant;
var mergeObjects = utility.mergeObjects;
var advQuery = require('./advquery');
var sentiment = require('sentiment');
var generatePositionData = display.generatePositionData;
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
                        display.computeMatchData(match);
                        renderMatch(match);
                        //Add to cache if latest parse version
                        if (match.parsed_data && match.parsed_data.version === constants.parser_version && config.NODE_ENV !== "development") {
                            redis.setex(key, 3600, JSON.stringify(match));
                        }
                        return cb(err, match);
                    });
                }
            });
        }
    });
}

function renderMatch(match) {
    var schema = utility.getParseSchema();
    //make sure parsed_data has all fields
    match.parsed_data = match.parsed_data || schema;
    //make sure each player's parsedplayer has all fields
    match.players.forEach(function(p, i) {
        mergeObjects(p.parsedPlayer, schema.players[i]);
    });
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
    match.chat_words = match.chat_words.join(' ');
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

function fillPlayerNames(players, cb) {
    //make hash of account_ids to players
    //use $in query to get these players from db
    //loop through results and join with players by hash
    //iterate back through original array to get back players in order
    var player_hash = {};
    players.forEach(function(p) {
        player_hash[p.account_id] = p;
    });
    var player_ids = players.map(function(p) {
        return p.account_id;
    });
    db.players.find({
        account_id: {
            $in: player_ids
        }
    }, function(err, docs) {
        if (err) {
            return cb(err);
        }
        docs.forEach(function(d) {
            var player = player_hash[d.account_id];
            if (player && d) {
                for (var prop in d) {
                    player[prop] = d[prop];
                }
            }
        });
        players = players.map(function(p) {
            return player_hash[p.account_id];
        });
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

function fillPlayerData(player, options, cb) {
    //received from controller
    //options.info, the tab the hero is on
    //options.query, the querystring from the user
    var select = {
        players: {
            $elemMatch: {
                account_id: player.account_id,
                hero_id: Number(options.query.hero_id) || {
                    $ne: null
                }
            }
        }
    };
    var project = {
        "players.$": 1,
        start_time: 1,
        match_id: 1,
        duration: 1,
        cluster: 1,
        radiant_win: 1,
        parse_status: 1,
        first_blood_time: 1,
        lobby_type: 1,
        game_mode: 1
    };
    var filter = {};
    if (options.info === "trends") {
        project.parsed_data = 1;
    }
    if (options.info !== "matches") {
        //todo use api/matches for matches tab?
        //we want all the matches if matches tab, not just balanced
        filter.balanced = 1;
    }
    /*
    if (options.query.hero_id) {
        //using post-process to filter specific hero from matches
        filter.hero_id = options.query.hero_id;
    }
    */
    advQuery({
        select: select,
        project: project,
        filter: filter
    }, function(err, results) {
        if (err) {
            return cb(err);
        }
        player.aggData = results.aggData;
        player.matches = results.data;
        player.obs = player.aggData.obs.counts;
        player.sen = player.aggData.sen.counts;
        var d = {
            "obs": true,
            "sen": true
        };
        generatePositionData(d, player);
        player.posData = [d];
        var radiantMap = {}; //map whether the this player was on radiant for a particular match for efficient lookup later when doing teammates/matchups
        for (var i = 0; i < player.matches.length; i++) {
            var m = player.matches[i];
            var p = m.players[0];
            //map if player was on radiant for this match for efficient teammate check later
            radiantMap[m.match_id] = isRadiant(p);
        }
        player.radiantMap = radiantMap;
        var match_ids = player.matches.map(function(m) {
            return m.match_id;
        });
        //do the query for teammates/hero matchups
        computeMatchups(player, match_ids, function(err) {
            cb(err, player);
        });
    });
}

function computeMatchups(player, match_ids, cb) {
    console.time("db2");
    db.matches.find({
        match_id: {
            $in: match_ids
        }
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
            var playerRadiant = player.radiantMap[match.match_id];
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
}
module.exports = {
    fillPlayerData: fillPlayerData,
    fillPlayerNames: fillPlayerNames,
    getRatingData: getRatingData,
    getSets: getSets,
    prepareMatch: prepareMatch
};