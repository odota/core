var utility = require('./utility');
var mode = utility.mode;
var max = utility.max;
var min = utility.min;
var generatePositionData = utility.generatePositionData;
var isRadiant = utility.isRadiant;
var constants = require('./constants.json');
var mergeObjects = utility.mergeObjects;
var sentiment = require('sentiment');
/**
 * Computes additional match stats based on parsed_data
 **/
function computeMatchData(match) {
    try {
        match.player_win = (isRadiant(match.players[0]) === match.radiant_win); //did the player win?
        var date = new Date(match.start_time * 1000);
        for (var i = 0; i < constants.patch.length; i++) {
            var pd = new Date(constants.patch[i].date);
            //stop when patch date is less than the start time
            if (pd < date) {
                break;
            }
        }
        match.patch = i;
        match.region = constants.cluster[match.cluster];
        //match.league_name = constants.leagues[match.leagueid] ? constants.leagues[match.leagueid].name : null;
        //add a parsedplayer object to each player, and compute more stats
        match.players.forEach(function(player, ind) {
            player.isRadiant = isRadiant(player);
            player.total_gold = ~~(player.gold_per_min * match.duration / 60);
            player.total_xp = ~~(player.xp_per_min * match.duration / 60);
            player.parseSlot = player.player_slot % (128 - 5);
            player.kda = ~~((player.kills + player.assists) / (player.deaths + 1));
            player.parsedPlayer = {};
        });
        if (match.parsed_data) {
            if (match.parsed_data.chat.length) {
                if (match.all_players) {
                    // aggregate all the words in these matches for each player_match (don't do this for single match display)
                    // aggregation of all words in all chat this player has experienced
                    match.all_word_counts = count_words(match, null);
                    // aggregation of only the words in all chat this player said themselves
                    match.my_word_counts = count_words(match, match.players[0]);
                }
            }
            //compute player-level data and set parsedPlayer
            match.players.forEach(function(player, ind) {
                //mapping 0 to 0, 128 to 5, etc.
                //if we projected only one player, then use slot 0
                if (match.parsed_data.players.length === 1) {
                    player.parseSlot = 0;
                }
                var parsedPlayer = match.parsed_data.players[player.parseSlot];
                if (parsedPlayer.kills_log) {
                    //remove meepo/meepo kills
                    if (player.hero_id === 82) {
                        parsedPlayer.kills_log = parsedPlayer.kills_log.filter(function(k) {
                            return k.key !== "npc_dota_hero_meepo";
                        });
                    }
                }
                if (parsedPlayer.kills) {
                    parsedPlayer.neutral_kills = 0;
                    parsedPlayer.tower_kills = 0;
                    parsedPlayer.courier_kills = 0;
                    parsedPlayer.lane_kills = 0;
                    parsedPlayer.hero_kills = 0;
                    parsedPlayer.observer_kills = 0;
                    parsedPlayer.sentry_kills = 0;
                    for (var key in parsedPlayer.kills) {
                        if (key.indexOf("creep_goodguys") !== -1 || key.indexOf("creep_badguys") !== -1) {
                            parsedPlayer.lane_kills += parsedPlayer.kills[key];
                        }
                        if (key.indexOf("observer") !== -1) {
                            parsedPlayer.observer_kills += parsedPlayer.kills[key];
                        }
                        if (key.indexOf("sentry") !== -1) {
                            parsedPlayer.sentry_kills += parsedPlayer.kills[key];
                        }
                        if (key.indexOf("npc_dota_hero") === 0) {
                            parsedPlayer.hero_kills += parsedPlayer.kills[key];
                        }
                        if (key.indexOf("npc_dota_neutral") === 0) {
                            parsedPlayer.neutral_kills += parsedPlayer.kills[key];
                        }
                        if (key.indexOf("_tower") !== -1) {
                            parsedPlayer.tower_kills += parsedPlayer.kills[key];
                        }
                        if (key.indexOf("courier") !== -1) {
                            parsedPlayer.courier_kills += parsedPlayer.kills[key];
                        }
                    }
                }
                if (parsedPlayer.buyback_log) {
                    parsedPlayer.buyback_count = parsedPlayer.buyback_log.length;
                }
                if (parsedPlayer.item_uses) {
                    parsedPlayer.observer_uses = parsedPlayer.item_uses.ward_observer || 0;
                    parsedPlayer.sentry_uses = parsedPlayer.item_uses.ward_sentry || 0;
                }
                if (parsedPlayer.gold) {
                    //lane efficiency: divide 10 minute gold by static amount based on standard creep spawn
                    //var tenMinute = (43 * 60 + 48 * 20 + 74 * 2);
                    //6.84 change
                    var tenMinute = (40 * 60 + 45 * 20 + 74 * 2) + (600 / 0.6) + 625;
                    parsedPlayer.lane_efficiency = (parsedPlayer.gold[10] || 0) / tenMinute;
                }
                //convert position hashes to heatmap array of x,y,value
                var d = {
                    "obs": true,
                    "sen": true,
                    //"pos": true,
                    "lane_pos": true
                };
                parsedPlayer.posData = generatePositionData(d, parsedPlayer);
                //p.explore = p.posData.pos.length / 128 / 128;
                //compute lanes
                var lanes = [];
                for (var i = 0; i < parsedPlayer.posData.lane_pos.length; i++) {
                    var dp = parsedPlayer.posData.lane_pos[i];
                    for (var j = 0; j < dp.value; j++) {
                        lanes.push(constants.lanes[dp.y][dp.x]);
                    }
                }
                if (lanes.length) {
                    parsedPlayer.lane = mode(lanes);
                    var radiant = player.isRadiant;
                    var lane_roles = {
                        "1": function() {
                            //bot
                            return radiant ? 1 : 3;
                        },
                        "2": function() {
                            //mid
                            return 2;
                        },
                        "3": function() {
                            //top
                            return radiant ? 3 : 1;
                        },
                        "4": function() {
                            //rjung
                            return 4;
                        },
                        "5": function() {
                            //djung
                            return 4;
                        }
                    };
                    parsedPlayer.lane_role = lane_roles[parsedPlayer.lane] ? lane_roles[parsedPlayer.lane]() : undefined;
                }
                //compute hashes of purchase time sums and counts from logs
                if (parsedPlayer.purchase_log) {
                    //remove ward dispenser and recipes
                    parsedPlayer.purchase_log = parsedPlayer.purchase_log.filter(function(purchase) {
                        return !(purchase.key.indexOf("recipe_") === 0 || purchase.key === "ward_dispenser");
                    });
                    parsedPlayer.purchase_time = {};
                    parsedPlayer.item_win = {};
                    parsedPlayer.item_usage = {};
                    for (var i = 0; i < parsedPlayer.purchase_log.length; i++) {
                        var k = parsedPlayer.purchase_log[i].key;
                        var time = parsedPlayer.purchase_log[i].time;
                        if (!parsedPlayer.purchase_time[k]) {
                            parsedPlayer.purchase_time[k] = 0;
                        }
                        parsedPlayer.purchase_time[k] += time;
                        parsedPlayer.item_usage[k] = 1;
                        parsedPlayer.item_win[k] = isRadiant(player) === match.radiant_win ? 1 : 0;
                    }
                }
                //compute throw/comeback levels
                if (match.parsed_data.radiant_gold_adv) {
                    var radiant_gold_advantage = match.parsed_data.radiant_gold_adv;
                    parsedPlayer.throw = match.radiant_win !== isRadiant(player) ? (isRadiant(player) ? max(radiant_gold_advantage) : min(radiant_gold_advantage) * -1) : undefined;
                    parsedPlayer.comeback = match.radiant_win === isRadiant(player) ? (isRadiant(player) ? min(radiant_gold_advantage) * -1 : max(radiant_gold_advantage)) : undefined;
                    parsedPlayer.loss = match.radiant_win !== isRadiant(player) ? (isRadiant(player) ? min(radiant_gold_advantage) * -1 : max(radiant_gold_advantage)) : undefined;
                    parsedPlayer.stomp = match.radiant_win === isRadiant(player) ? (isRadiant(player) ? max(radiant_gold_advantage) : min(radiant_gold_advantage) * -1) : undefined;
                }
                //code to cap killstreaks, but don't need to do (don't count streaks beyond 10, since the 10-streak will have been counted?)
                /*
                for (var key in p.kill_streaks) {
                    if (Number(key) > 10) {
                        p.kill_streaks["10"] += p.kill_streaks[key];
                    }
                }
                */
                player.parsedPlayer = parsedPlayer;
            });
        }
    }
    catch (e) {
        console.log(e.stack, match.match_id);
    }
}
// count the words that occur in a set of messages
// - messages: the messages to create the counts over
// - player_filter: if non-null, only count that player's messages
function count_words(match, player_filter) {
    var messages = match.parsed_data.chat;
    // extract the message strings from the message objects
    // extract individual words from the message strings
    var chat_words = [];
    messages.forEach(function(message) {
        // adjust the slot position (important if there are fewer than 10 players)
        var adjusted_slot = match.all_players[message.slot] ? message.slot : message.slot - 5;
        var p = match.all_players[adjusted_slot] || {};
        // if there is no player_filter, or if the player_filter matches this message, log it
        if (!player_filter || p.player_slot === player_filter.player_slot) {
            chat_words.push(message.key);
        }
    });
    chat_words = chat_words.join(' ');
    var tokens = utility.tokenize(chat_words);
    // count how frequently each word occurs
    var counts = {};
    for (var i = 0; i < tokens.length; i++) {
        //ignore the empty string
        if (tokens[i]) {
            if (!counts[tokens[i]]) {
                counts[tokens[i]] = 0;
            }
            counts[tokens[i]] += 1;
        }
    }
    // return the final counts
    return counts;
}
/**
 * Renders display-only data for a match
 **/
function renderMatch(match) {
    var schema = utility.getParseSchema();
    //fill in version 0 if not present
    schema.version = 0;
    //make sure match.parsed_data is not null
    match.parsed_data = match.parsed_data || schema;
    //make sure parsed_data has all fields
    for (var key in schema) {
        match.parsed_data[key] = match.parsed_data[key] || schema[key];
    }
    //make sure each player's parsedplayer has all fields
    match.players.forEach(function(p, i) {
        mergeObjects(p.parsedPlayer, schema.players[i]);
    });
    match.players.forEach(function(player, i) {
        //converts hashes to arrays and sorts them
        var p = player.parsedPlayer;
        var targets = ["ability_uses", "item_uses", "damage_inflictor"];
        targets.forEach(function(target) {
            var t = [];
            for (var key in p[target]) {
                var a = constants.abilities[key];
                var i = constants.items[key];
                var def = {
                    img: "/public/images/default_attack.png"
                };
                def = a || i || def;
                var result = {
                    img: def.img,
                    name: key === "undefined" ? "Auto Attack/Other" : key,
                    val: p[target][key],
                    className: a ? "ability" : i ? "item" : "img-small"
                };
                if (p.hero_hits) {
                    result.hero_hits = p.hero_hits[key];
                }
                t.push(result);
            }
            t.sort(function(a, b) {
                return b.val - a.val;
            });
            p[target + "_arr"] = t;
        });
        //filter interval data to only be >= 0
        if (p.times) {
            var intervals = ["lh", "gold", "xp", "times"];
            intervals.forEach(function(key) {
                p[key] = p[key].filter(function(el, i) {
                    return p.times[i] >= 0;
                });
            });
        }
    });
    //make a list of messages and join them all together for sentiment analysis
    var chat_words = match.parsed_data.chat.map(function(message) {
        return message.key;
    }).join(' ');
    match.sentiment = sentiment(chat_words, {
        "report": -2,
        "commend": 2,
        "noob": -2,
        "ff": -1,
        "bg": -1,
        "feed": -1,
        "ty": 1,
        "thanks": 1,
        "wp": 1,
        "end": -1,
        "garbage": -1,
        "trash": -1,
        "throw": -1,
        "salt": -1,
        "ez": -1,
        "mad": -1
    });
    //create graph data
    match.graphData = generateGraphData(match);
    match.incomeData = generateIncomeData(match);
    //create heatmap data
    match.posData = match.players.map(function(p) {
        return p.parsedPlayer.posData;
    });
    //process objectives
    match.parsed_data.objectives.forEach(function(entry) {
        var adjSlot = match.players[entry.slot] ? entry.slot : entry.slot - 5;
        var p = match.players[adjSlot] || {};
        entry.objective = constants.objectives[entry.subtype] || entry.subtype;
        entry.team = entry.team === 2 || entry.key < 64 || p.isRadiant ? 0 : 1;
        entry.hero_img = constants.heroes[p.hero_id] ? constants.heroes[p.hero_id].img : "";
    });
    //process teamfight data
    match.parsed_data.teamfights.forEach(function(tf) {
        tf.posData = [];
        tf.radiant_gold_delta = 0;
        tf.radiant_xp_delta = 0;
        tf.radiant_participation = 0;
        tf.radiant_deaths = 0;
        tf.dire_participation = 0;
        tf.dire_deaths = 0;
        tf.players.forEach(function(p) {
            //lookup starting, ending level
            p.level_start = getLevelFromXp(p.xp_start);
            p.level_end = getLevelFromXp(p.xp_end);

            function getLevelFromXp(xp) {
                for (var i = 0; i < constants.xp_level.length; i++) {
                    if (constants.xp_level[i] > xp) {
                        return i;
                    }
                }
                return constants.xp_level.length;
            }
        });
        //add player's hero_id to each teamfight participant
        match.players.forEach(function(p) {
            //index into the correct slot
            var player = tf.players[p.parseSlot];
            player.hero_id = p.hero_id;
            player.player_slot = p.player_slot;
            player.isRadiant = isRadiant(p);
            player.participate = player.deaths > 0 || player.damage > 0;
            p.teamfights_participated = p.teamfights_participated || 0;
            p.teamfights_participated += player.participate ? 1 : 0;
            //compute team gold/xp deltas
            if (isRadiant(p)) {
                tf.radiant_gold_delta += player.gold_delta;
                tf.radiant_xp_delta += player.xp_delta;
                tf.radiant_participation += player.participate ? 1 : 0;
                tf.radiant_deaths += player.deaths ? 1 : 0;
            }
            else {
                tf.radiant_gold_delta -= player.gold_delta;
                tf.radiant_xp_delta -= player.xp_delta;
                tf.dire_participation += player.participate ? 1 : 0;
                tf.dire_deaths += player.deaths ? 1 : 0;
            }
            //convert 2d hash to array
            player.posData = generatePositionData({
                deaths_pos: 1
            }, player);
            //console.log(player);
            //add player hero id to each death, push into teamfight death position array
            player.posData.deaths_pos.forEach(function(pt) {
                pt.hero_id = player.hero_id;
                tf.posData.push(pt);
            });
        });
    });
}
/**
 * Generates data for c3 charts in a match
 **/
function generateGraphData(match) {
    //compute graphs
    var goldDifference = ['Gold'];
    var xpDifference = ['XP'];
    if (match.parsed_data.radiant_gold_adv.length) {
        goldDifference = goldDifference.concat(match.parsed_data.radiant_gold_adv);
        xpDifference = xpDifference.concat(match.parsed_data.radiant_xp_adv);
    }
    else {
        //TODO older matches need this data summed at view time, unless we migrate it
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
    return data;
}

function generateIncomeData(match) {
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
    return {
        cats: categories,
        goldCols: columns,
        gold_reasons: gold_reasons
    };
}
module.exports = {
    renderMatch: renderMatch,
    computeMatchData: computeMatchData
};
