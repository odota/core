var utility = require('./utility');
var generatePlayerAnalysis = require('./analysis');
var constants = require('dotaconstants');
var mode = utility.mode;
var max = utility.max;
var min = utility.min;
var isRadiant = utility.isRadiant;
var generatePositionData = utility.generatePositionData;
var sentiment = require('sentiment');
var ancients = constants.ancients;
var specific = constants.specific;
var expanded = {};
for (var key in specific)
{
    for (var i = 1; i < 5; i++)
    {
        expanded[key.replace("#", i)] = specific[key];
    }
}
/**
 * Computes additional properties from a match/player_match
 **/
function computeMatchData(pm)
{
    var self_hero = constants.heroes[pm.hero_id];
    // Compute patch based on start_time
    if (pm.start_time)
    {
        pm.patch = utility.getPatchIndex(pm.start_time);
    }
    if (pm.cluster)
    {
        pm.region = constants.cluster[pm.cluster];
    }
    if (pm.player_slot !== undefined && pm.radiant_win !== undefined)
    {
        pm.isRadiant = isRadiant(pm);
        pm.win = Number(isRadiant(pm) === pm.radiant_win);
        pm.lose = Number(isRadiant(pm) === pm.radiant_win) ? 0 : 1;
    }
    if (pm.duration && pm.gold_per_min)
    {
        pm.total_gold = ~~(pm.gold_per_min * pm.duration / 60);
    }
    if (pm.duration && pm.xp_per_min)
    {
        pm.total_xp = ~~(pm.xp_per_min * pm.duration / 60);
    }
    if (pm.duration && pm.kills)
    {
        pm.kills_per_min = pm.kills / (pm.duration / 60);
    }
    if (pm.kills !== undefined && pm.deaths !== undefined && pm.assists !== undefined)
    {
        pm.kda = ~~((pm.kills + pm.assists) / (pm.deaths + 1));
    }
    if (pm.leaver_status !== undefined)
    {
        pm.abandons = Number(pm.leaver_status >= 2);
    }
    if (pm.pgroup)
    {
        pm.heroes = pm.pgroup;
    }
    if (pm.chat)
    {
        // word counts for this player and all players
        // aggregation of all words in all chat this player has experienced
        pm.all_word_counts = count_words(pm, null);
        // aggregation of only the words in all chat this player said themselves
        pm.my_word_counts = count_words(pm, pm);
    }
    if (pm.kills_log && self_hero)
    {
        //remove self kills
        pm.kills_log = pm.kills_log.filter(function (k)
        {
            return k.key !== self_hero.name;
        });
    }
    if (pm.killed)
    {
        pm.neutral_kills = 0;
        pm.tower_kills = 0;
        pm.courier_kills = 0;
        pm.lane_kills = 0;
        pm.hero_kills = 0;
        pm.observer_kills = 0;
        pm.sentry_kills = 0;
        pm.roshan_kills = 0;
        pm.necronomicon_kills = 0;
        pm.ancient_kills = 0;
        pm.specific = {};
        //expand keys in specific by # (1-4)
        //map to friendly name
        //iterate through keys in killed
        //if in expanded, put in pm.specific
        for (var key in pm.killed)
        {
            if (key in expanded)
            {
                var name = expanded[key];
                pm.specific[name] = pm.specific[name] ? pm.specific[name] + pm.killed[key] : pm.killed[key];
            }
            if (key.indexOf("creep_goodguys") !== -1 || key.indexOf("creep_badguys") !== -1)
            {
                pm.lane_kills += pm.killed[key];
            }
            if (key.indexOf("observer") !== -1)
            {
                pm.observer_kills += pm.killed[key];
            }
            if (key.indexOf("sentry") !== -1)
            {
                pm.sentry_kills += pm.killed[key];
            }
            if (key.indexOf("npc_dota_hero") === 0)
            {
                if (!self_hero || self_hero.name !== key)
                {
                    pm.hero_kills += pm.killed[key];
                }
            }
            if (key.indexOf("npc_dota_neutral") === 0)
            {
                pm.neutral_kills += pm.killed[key];
            }
            if ((key in ancients))
            {
                pm.ancient_kills += pm.killed[key];
            }
            if (key.indexOf("_tower") !== -1)
            {
                pm.tower_kills += pm.killed[key];
            }
            if (key.indexOf("courier") !== -1)
            {
                pm.courier_kills += pm.killed[key];
            }
            if (key.indexOf("roshan") !== -1)
            {
                pm.roshan_kills += pm.killed[key];
            }
            if (key.indexOf("necronomicon") !== -1)
            {
                pm.necronomicon_kills += pm.killed[key];
            }
        }
    }
    if (pm.buyback_log)
    {
        pm.buyback_count = pm.buyback_log.length;
    }
    if (pm.item_uses)
    {
        pm.observer_uses = pm.item_uses.ward_observer || 0;
        pm.sentry_uses = pm.item_uses.ward_sentry || 0;
    }
    if (pm.gold_t && pm.gold_t[10])
    {
        //lane efficiency: divide 10 minute gold by static amount based on standard creep spawn
        //var tenMinute = (43 * 60 + 48 * 20 + 74 * 2);
        //6.84 change
        var tenMinute = (40 * 60 + 45 * 20 + 74 * 2) + (600 / 0.6) + 625;
        pm.lane_efficiency = pm.gold_t[10] / tenMinute;
        pm.lane_efficiency_pct = ~~(pm.lane_efficiency * 100);
    }
    if (pm.obs)
    {
        //convert position hashes to heatmap array of x,y,value
        pm.posData = generatePositionData(
        {
            "obs": true,
            "sen": true,
            //"pos": true,
            "lane_pos": true
        }, pm);
    }
    if (pm.posData)
    {
        //compute lanes
        var lanes = [];
        for (var i = 0; i < pm.posData.lane_pos.length; i++)
        {
            var dp = pm.posData.lane_pos[i];
            for (var j = 0; j < dp.value; j++)
            {
                if (constants.lanes[dp.y])
                {
                    lanes.push(constants.lanes[dp.y][dp.x]);
                }
            }
        }
        if (lanes.length)
        {
            pm.lane = mode(lanes);
            var radiant = pm.isRadiant;
            var lane_roles = {
                "1": function ()
                {
                    //bot
                    return radiant ? 1 : 3;
                },
                "2": function ()
                {
                    //mid
                    return 2;
                },
                "3": function ()
                {
                    //top
                    return radiant ? 3 : 1;
                },
                "4": function ()
                {
                    //rjung
                    return 4;
                },
                "5": function ()
                {
                    //djung
                    return 4;
                }
            };
            pm.lane_role = lane_roles[pm.lane] ? lane_roles[pm.lane]() : undefined;
        }
    }
    //compute hashes of purchase time sums and counts from logs
    if (pm.purchase_log)
    {
        //remove ward dispenser and recipes
        pm.purchase_log = pm.purchase_log.filter(function (purchase)
        {
            return !(purchase.key.indexOf("recipe_") === 0 || purchase.key === "ward_dispenser");
        });
        pm.purchase_time = {};
        pm.first_purchase_time = {};
        pm.item_win = {};
        pm.item_usage = {};
        for (var i = 0; i < pm.purchase_log.length; i++)
        {
            var k = pm.purchase_log[i].key;
            var time = pm.purchase_log[i].time;
            if (!pm.purchase_time[k])
            {
                pm.purchase_time[k] = 0;
            }
            // Store first purchase time for every item
            if (!pm.first_purchase_time.hasOwnProperty(k))
            {
                pm.first_purchase_time[k] = time;
            }
            pm.purchase_time[k] += time;
            pm.item_usage[k] = 1;
            pm.item_win[k] = isRadiant(pm) === pm.radiant_win ? 1 : 0;
        }
    }
    if (pm.purchase)
    {
        //account for stacks
        pm.purchase.ward_sentry *= 2;
        pm.purchase.dust *= 2;
        pm.purchase_ward_observer = pm.purchase.ward_observer;
        pm.purchase_ward_sentry = pm.purchase.ward_sentry;
        pm.purchase_tpscroll = pm.purchase.tpscroll;
        pm.purchase_rapier = pm.purchase.rapier;
        pm.purchase_gem = pm.purchase.gem;
    }
    if (pm.actions && pm.duration)
    {
        var actions_sum = 0;
        for (var key in pm.actions)
        {
            actions_sum += pm.actions[key];
        }
        pm.actions_per_min = ~~(actions_sum / pm.duration * 60);
    }
    //compute throw/comeback levels
    if (pm.radiant_gold_adv && pm.radiant_win !== undefined)
    {
        var radiant_gold_advantage = pm.radiant_gold_adv;
        pm.throw = pm.radiant_win !== isRadiant(pm) ? (isRadiant(pm) ? max(radiant_gold_advantage) : min(radiant_gold_advantage) * -1) : undefined;
        pm.comeback = pm.radiant_win === isRadiant(pm) ? (isRadiant(pm) ? min(radiant_gold_advantage) * -1 : max(radiant_gold_advantage)) : undefined;
        pm.loss = pm.radiant_win !== isRadiant(pm) ? (isRadiant(pm) ? min(radiant_gold_advantage) * -1 : max(radiant_gold_advantage)) : undefined;
        pm.stomp = pm.radiant_win === isRadiant(pm) ? (isRadiant(pm) ? max(radiant_gold_advantage) : min(radiant_gold_advantage) * -1) : undefined;
    }
    if (pm.pings)
    {
        pm.pings = pm.pings[0];
    }
    if (pm.life_state)
    {
        pm.life_state_dead = (pm.life_state[1] || 0) + (pm.life_state[2] || 0);
    }
}
/**
 * Renders display-only data for a match (doesn't need to be aggregated)
 **/
function renderMatch(m)
{
    m.hero_combat = {
        damage:
        {
            radiant: 0,
            dire: 0,
        },
        kills:
        {
            radiant: 0,
            dire: 0,
        },
    };
    //do render-only processing (not needed for aggregation, only for match display)
    m.players.forEach(function (pm, i)
    {
        //converts hashes to arrays and sorts them
        var targets = ["ability_uses", "item_uses", "damage_inflictor", "damage_inflictor_received"];
        targets.forEach(function (target)
        {
            if (pm[target])
            {
                var t = [];
                for (var key in pm[target])
                {
                    var a = constants.abilities[key];
                    var i = constants.items[key];
                    var def = {
                        img: "/public/images/default_attack.png"
                    };
                    def = a || i || def;
                    var result = {
                        img: def.img,
                        name: (!a && !i) ? "Auto Attack/Other" : key,
                        val: pm[target][key],
                        className: a ? "ability" : i ? "item" : "img-sm"
                    };
                    if (pm.hero_hits)
                    {
                        result.hero_hits = pm.hero_hits[key];
                    }
                    t.push(result);
                }
                t.sort(function (a, b)
                {
                    return b.val - a.val;
                });
                pm[target + "_arr"] = t;
            }
        });
        //filter interval data to only be >= 0
        if (pm.times)
        {
            var intervals = ["lh_t", "gold_t", "xp_t", "times"];
            intervals.forEach(function (key)
            {
                pm[key] = pm[key].filter(function (el, i)
                {
                    return pm.times[i] >= 0;
                });
            });
        }
        //compute damage to towers/rax/roshan
        if (pm.damage)
        {
            //npc_dota_goodguys_tower2_top
            //npc_dota_goodguys_melee_rax_top
            //npc_dota_roshan
            //npc_dota_neutral_giant_wolf
            //npc_dota_creep
            pm.objective_damage = {};
            for (var key in pm.damage)
            {
                var identifier = null;
                if (key.indexOf("tower") !== -1)
                {
                    identifier = key.split("_").slice(3).join("_");
                }
                if (key.indexOf("rax") !== -1)
                {
                    identifier = key.split("_").slice(4).join("_");
                }
                if (key.indexOf("roshan") !== -1)
                {
                    identifier = "roshan";
                }
                if (key.indexOf("fort") !== -1)
                {
                    identifier = "fort";
                }
                pm.objective_damage[identifier] = pm.objective_damage[identifier] ? pm.objective_damage[identifier] + pm.damage[key] : pm.damage[key];
            }
        }
        try
        {
            // Compute combat k/d and damage tables
            pm.hero_combat = {
                damage:
                {
                    total: 0,
                },
                taken:
                {
                    total: 0,
                },
                kills:
                {
                    total: 0,
                },
                deaths:
                {
                    total: 0,
                },
            };
            m.players.forEach(function (other_pm)
            {
                var team = (pm.isRadiant) ? 'radiant' : 'dire';
                var other_hero = constants.heroes[other_pm.hero_id];
                var damage = 0;
                var taken = 0;
                var kills = 0;
                var deaths = 0;
                // Only care about enemy hero combat
                if (pm.isRadiant !== other_pm.isRadiant && pm.damage)
                {
                    damage = (pm.damage[other_hero.name]) ? pm.damage[other_hero.name] : 0;
                    taken = (pm.damage_taken[other_hero.name]) ? pm.damage_taken[other_hero.name] : 0;
                }
                if (pm.isRadiant !== other_pm.isRadiant && pm.killed)
                {
                    kills = (pm.killed[other_hero.name]) ? pm.killed[other_hero.name] : 0;
                    deaths = (pm.killed_by[other_hero.name]) ? pm.killed_by[other_hero.name] : 0;
                }
                pm.hero_combat.damage[other_hero.name] = damage;
                pm.hero_combat.taken[other_hero.name] = taken;
                pm.hero_combat.damage.total += damage;
                pm.hero_combat.taken.total += taken;
                pm.hero_combat.kills[other_hero.name] = kills;
                pm.hero_combat.deaths[other_hero.name] = deaths;
                pm.hero_combat.kills.total += kills;
                pm.hero_combat.deaths.total += deaths;
                m.hero_combat.damage[team] += damage;
                m.hero_combat.kills[team] += kills;
            });
        }
        catch (e)
        {
            console.error("error occurred while summing crosstables");
            console.error(e);
        }
    });
    console.time("generating player analysis");
    m.players.forEach(function (pm, i)
    {
        pm.analysis = generatePlayerAnalysis(m, pm);
    });
    console.timeEnd("generating player analysis");
    if (m.chat)
    {
        //make a list of messages and join them all together for sentiment analysis
        var chat_words = m.chat.map(function (message)
        {
            return message.key;
        }).join(' ');
        m.sentiment = sentiment(chat_words,
        {
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
            "mad": -1,
            "hero": 0,
            "salty": -1,
            "autist": -1,
            "autism": -1
        });
    }
    //create gold breakdown data
    if (m.players[0] && m.players[0].gold_reasons)
    {
        m.incomeData = generateIncomeData(m);
    }
    //create graph data
    if (m.players[0] && m.players[0].gold_t)
    {
        m.graphData = generateGraphData(m);
    }
    //create heatmap data
    m.posData = m.players.map(function (p)
    {
        return p.posData;
    });
    //process objectives
    if (m.objectives)
    {
        m.objectives.forEach(function (entry)
        {
            entry.objective = constants.objectives[entry.subtype] || entry.subtype;
            var p = m.players[entry.slot];
            if (p)
            {
                entry.team = entry.team === 2 || entry.key < 64 || p.isRadiant ? 0 : 1;
                entry.hero_img = constants.heroes[p.hero_id] ? constants.heroes[p.hero_id].img : "";
            }
        });
    }
    //process teamfight data
    if (m.teamfights)
    {
        m.teamfights.forEach(function (tf)
        {
            tf.posData = [];
            tf.radiant_gold_delta = 0;
            tf.radiant_xp_delta = 0;
            tf.radiant_participation = 0;
            tf.radiant_deaths = 0;
            tf.dire_participation = 0;
            tf.dire_deaths = 0;
            tf.players.forEach(function (p)
            {
                //lookup starting, ending level
                p.level_start = getLevelFromXp(p.xp_start);
                p.level_end = getLevelFromXp(p.xp_end);

                function getLevelFromXp(xp)
                {
                    for (var i = 0; i < constants.xp_level.length; i++)
                    {
                        if (constants.xp_level[i] > xp)
                        {
                            return i;
                        }
                    }
                    return constants.xp_level.length;
                }
            });
            //add player's hero_id to each teamfight participant
            m.players.forEach(function (p, i)
            {
                var tfplayer = tf.players[p.player_slot % (128 - 5)];
                tfplayer.hero_id = p.hero_id;
                tfplayer.player_slot = p.player_slot;
                tfplayer.isRadiant = isRadiant(p);
                tfplayer.personaname = p.personaname;
                tfplayer.account_id = p.account_id;
                tfplayer.participate = tfplayer.deaths > 0 || tfplayer.damage > 0 || tfplayer.healing > 0;
                if (!p.teamfights_participated)
                {
                    p.teamfights_participated = 0;
                }
                p.teamfights_participated += tfplayer.participate ? 1 : 0;
                //compute team gold/xp deltas
                if (isRadiant(p))
                {
                    tf.radiant_gold_delta += tfplayer.gold_delta;
                    tf.radiant_xp_delta += tfplayer.xp_delta;
                    tf.radiant_participation += tfplayer.participate ? 1 : 0;
                    tf.radiant_deaths += tfplayer.deaths ? 1 : 0;
                }
                else
                {
                    tf.radiant_gold_delta -= tfplayer.gold_delta;
                    tf.radiant_xp_delta -= tfplayer.xp_delta;
                    tf.dire_participation += tfplayer.participate ? 1 : 0;
                    tf.dire_deaths += tfplayer.deaths ? 1 : 0;
                }
                //convert 2d hash to array
                tfplayer.posData = generatePositionData(
                {
                    deaths_pos: 1
                }, tfplayer);
                //console.log(player);
                //add player hero id to each death, push into teamfight death position array
                tfplayer.posData.deaths_pos.forEach(function (pt)
                {
                    pt.hero_id = tfplayer.hero_id;
                    tf.posData.push(pt);
                });
            });
        });
    }
}
/**
 * Generates data for c3 charts in a match
 **/
function generateGraphData(match)
{
    //compute graphs
    var goldDifference = ['Gold'];
    var xpDifference = ['XP'];
    goldDifference = goldDifference.concat(match.radiant_gold_adv);
    xpDifference = xpDifference.concat(match.radiant_xp_adv);
    var time = ["time"].concat(match.players[0].times);
    var data = {
        difference: [time, xpDifference, goldDifference],
        gold: [time],
        xp: [time],
        lh: [time]
    };
    match.players.forEach(function (p, i)
    {
        var hero = constants.heroes[p.hero_id] ||
        {};
        hero = hero.localized_name;
        data.gold.push([hero].concat(p.gold_t));
        data.xp.push([hero].concat(p.xp_t));
        data.lh.push([hero].concat(p.lh_t));
    });
    return data;
}

function generateIncomeData(match)
{
    //data for income chart
    var gold_reasons = [];
    var columns = [];
    var categories = [];
    var imgs = [];
    var orderedPlayers = match.players.slice(0);
    orderedPlayers.sort(function (a, b)
    {
        return b.gold_per_min - a.gold_per_min;
    });
    orderedPlayers.forEach(function (player)
    {
        var hero = constants.heroes[player.hero_id] ||
        {};
        categories.push(hero.localized_name);
        imgs.push(hero.img);
    });
    for (var key in constants.gold_reasons)
    {
        var reason = constants.gold_reasons[key].name;
        gold_reasons.push(reason);
        var col = [reason];
        orderedPlayers.forEach(function (player)
        {
            var g = player.gold_reasons;
            col.push(g ? g[key] : 0);
        });
        columns.push(col);
    }
    return {
        cats: categories,
        goldCols: columns,
        gold_reasons: gold_reasons,
        imgs: imgs
    };
}

/**
 * Count the words that occur in a set of messages
 * - messages: the messages to create the counts over
 * - player_filter: if non-null, only count that player's messages
 **/
function count_words(player_match, player_filter)
{
    var messages = player_match.chat;
    // extract the message strings from the message objects
    // extract individual words from the message strings
    var chat_words = [];
    messages.forEach(function (message)
    {
        // if there is no player_filter, or if the passed player's player_slot matches this message's parseSlot converted to player_slot, log it
        var messageParseSlot = message.slot < 5 ? message.slot : message.slot + (128 - 5);
        if (!player_filter || (messageParseSlot === player_filter.player_slot))
        {
            chat_words.push(message.key);
        }
    });
    chat_words = chat_words.join(' ');
    var tokens = utility.tokenize(chat_words);
    // count how frequently each word occurs
    var counts = {};
    for (var i = 0; i < tokens.length; i++)
    {
        //ignore the empty string
        if (tokens[i])
        {
            if (!counts[tokens[i]])
            {
                counts[tokens[i]] = 0;
            }
            counts[tokens[i]] += 1;
        }
    }
    // return the final counts
    return counts;
}
module.exports = {
    renderMatch,
    computeMatchData,
    count_words,
};
