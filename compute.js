var utility = require('./utility');
var mode = utility.mode;
var max = utility.max;
var min = utility.min;
var generatePositionData = utility.generatePositionData;
var isRadiant = utility.isRadiant;
var constants = require('./constants.js');
var sentiment = require('sentiment');
var util = require('util');

function computeMatchData(match)
{
    var date = new Date(match.start_time * 1000);
    for (var i = 1; i < constants.patch.length; i++)
    {
        var pd = new Date(constants.patch[i].date);
        //stop when patch date is past the start time
        if (pd > date)
        {
            break;
        }
    }
    //use the value of i before the break, started at 1 to avoid negative index
    match.patch = i - 1;
    match.region = constants.cluster[match.cluster];
}
/**
 * Computes additional stats from stored data for a player_match
 **/
function computePlayerMatchData(player_match)
{
    computeMatchData(player_match);
    player_match.player_win = (isRadiant(player_match) === player_match.radiant_win); //did the player win?
    player_match.isRadiant = isRadiant(player_match);
    player_match.total_gold = ~~(player_match.gold_per_min * player_match.duration / 60);
    player_match.total_xp = ~~(player_match.xp_per_min * player_match.duration / 60);
    player_match.kda = ~~((player_match.kills + player_match.assists) / (player_match.deaths + 1));
    var self_hero = constants.heroes[player_match.hero_id];
    if (player_match.chat)
    {
        // word counts for this player and all players
        // aggregation of all words in all chat this player has experienced
        player_match.all_word_counts = count_words(player_match, null);
        // aggregation of only the words in all chat this player said themselves
        player_match.my_word_counts = count_words(player_match, player_match);
    }
    if (player_match.kills_log && self_hero)
    {
        //remove self kills
        player_match.kills_log = player_match.kills_log.filter(function(k)
        {
            return k.key !== self_hero.name;
        });
    }
    if (player_match.killed)
    {
        player_match.neutral_kills = 0;
        player_match.tower_kills = 0;
        player_match.courier_kills = 0;
        player_match.lane_kills = 0;
        player_match.hero_kills = 0;
        player_match.observer_kills = 0;
        player_match.sentry_kills = 0;
        player_match.necronomicon_kills = 0;
        for (var key in player_match.killed)
        {
            if (key.indexOf("creep_goodguys") !== -1 || key.indexOf("creep_badguys") !== -1)
            {
                player_match.lane_kills += player_match.killed[key];
            }
            if (key.indexOf("observer") !== -1)
            {
                player_match.observer_kills += player_match.killed[key];
            }
            if (key.indexOf("sentry") !== -1)
            {
                player_match.sentry_kills += player_match.killed[key];
            }
            if (key.indexOf("npc_dota_hero") === 0)
            {
                if (!self_hero || self_hero.name !== key)
                {
                    player_match.hero_kills += player_match.killed[key];
                }
            }
            if (key.indexOf("npc_dota_neutral") === 0)
            {
                player_match.neutral_kills += player_match.killed[key];
            }
            if (key.indexOf("_tower") !== -1)
            {
                player_match.tower_kills += player_match.killed[key];
            }
            if (key.indexOf("courier") !== -1)
            {
                player_match.courier_kills += player_match.killed[key];
            }
            if (key.indexOf("necronomicon") !== -1){
                player_match.necronomicon_kills += player_match.killed[key];
            }
        }
    }
    if (player_match.buyback_log)
    {
        player_match.buyback_count = player_match.buyback_log.length;
    }
    if (player_match.item_uses)
    {
        player_match.observer_uses = player_match.item_uses.ward_observer || 0;
        player_match.sentry_uses = player_match.item_uses.ward_sentry || 0;
    }
    if (player_match.gold_t)
    {
        //lane efficiency: divide 10 minute gold by static amount based on standard creep spawn
        //var tenMinute = (43 * 60 + 48 * 20 + 74 * 2);
        //6.84 change
        var tenMinute = (40 * 60 + 45 * 20 + 74 * 2) + (600 / 0.6) + 625;
        player_match.lane_efficiency = (player_match.gold_t[10] || 0) / tenMinute;
    }
    //convert position hashes to heatmap array of x,y,value
    var d = {
        "obs": true,
        "sen": true,
        //"pos": true,
        "lane_pos": true
    };
    player_match.posData = generatePositionData(d, player_match);
    //p.explore = p.posData.pos.length / 128 / 128;
    //compute lanes
    var lanes = [];
    for (var i = 0; i < player_match.posData.lane_pos.length; i++)
    {
        var dp = player_match.posData.lane_pos[i];
        for (var j = 0; j < dp.value; j++)
        {
            lanes.push(constants.lanes[dp.y][dp.x]);
        }
    }
    if (lanes.length)
    {
        player_match.lane = mode(lanes);
        var radiant = player_match.isRadiant;
        var lane_roles = {
            "1": function()
            {
                //bot
                return radiant ? 1 : 3;
            },
            "2": function()
            {
                //mid
                return 2;
            },
            "3": function()
            {
                //top
                return radiant ? 3 : 1;
            },
            "4": function()
            {
                //rjung
                return 4;
            },
            "5": function()
            {
                //djung
                return 4;
            }
        };
        player_match.lane_role = lane_roles[player_match.lane] ? lane_roles[player_match.lane]() : undefined;
    }
    //compute hashes of purchase time sums and counts from logs
    if (player_match.purchase_log)
    {
        //remove ward dispenser and recipes
        player_match.purchase_log = player_match.purchase_log.filter(function(purchase)
        {
            return !(purchase.key.indexOf("recipe_") === 0 || purchase.key === "ward_dispenser");
        });
        player_match.purchase_time = {};
        player_match.item_win = {};
        player_match.item_usage = {};
        for (var i = 0; i < player_match.purchase_log.length; i++)
        {
            var k = player_match.purchase_log[i].key;
            var time = player_match.purchase_log[i].time;
            if (!player_match.purchase_time[k])
            {
                player_match.purchase_time[k] = 0;
            }
            player_match.purchase_time[k] += time;
            player_match.item_usage[k] = 1;
            player_match.item_win[k] = isRadiant(player_match) === player_match.radiant_win ? 1 : 0;
        }
    }
    if (player_match.purchase)
    {
        //account for stacks
        player_match.purchase.ward_sentry *= 2;
        player_match.purchase.dust *= 2;
    }
    if (player_match.actions)
    {
        var actions_sum = 0;
        for (var key in player_match.actions)
        {
            actions_sum += player_match.actions[key];
        }
        player_match.actions_per_min = ~~(actions_sum / player_match.duration * 60);
    }
    //compute throw/comeback levels
    if (player_match.radiant_gold_adv)
    {
        var radiant_gold_advantage = player_match.radiant_gold_adv;
        player_match.throw = player_match.radiant_win !== isRadiant(player_match) ? (isRadiant(player_match) ? max(radiant_gold_advantage) : min(radiant_gold_advantage) * -1) : undefined;
        player_match.comeback = player_match.radiant_win === isRadiant(player_match) ? (isRadiant(player_match) ? min(radiant_gold_advantage) * -1 : max(radiant_gold_advantage)) : undefined;
        player_match.loss = player_match.radiant_win !== isRadiant(player_match) ? (isRadiant(player_match) ? min(radiant_gold_advantage) * -1 : max(radiant_gold_advantage)) : undefined;
        player_match.stomp = player_match.radiant_win === isRadiant(player_match) ? (isRadiant(player_match) ? max(radiant_gold_advantage) : min(radiant_gold_advantage) * -1) : undefined;
    }
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
    messages.forEach(function(message)
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
/**
 * Renders display-only data for a match (doesn't need to be aggregated)
 **/
function renderMatch(m)
{
    //do render-only processing (not needed for aggregation, only for match display)
    m.players.forEach(function(player_match, i)
    {
        //converts hashes to arrays and sorts them
        var targets = ["ability_uses", "item_uses", "damage_inflictor"];
        targets.forEach(function(target)
        {
            if (player_match[target])
            {
                var t = [];
                for (var key in player_match[target])
                {
                    var a = constants.abilities[key];
                    var i = constants.items[key];
                    var def = {
                        img: "/public/images/default_attack.png"
                    };
                    def = a || i || def;
                    var result = {
                        img: def.img,
                        name: key === "undefined" ? "Auto Attack/Other" : key,
                        val: player_match[target][key],
                        className: a ? "ability" : i ? "item" : "img-sm"
                    };
                    if (player_match.hero_hits)
                    {
                        result.hero_hits = player_match.hero_hits[key];
                    }
                    t.push(result);
                }
                t.sort(function(a, b)
                {
                    return b.val - a.val;
                });
                player_match[target + "_arr"] = t;
            }
        });
        //filter interval data to only be >= 0
        if (player_match.times)
        {
            var intervals = ["lh_t", "gold_t", "xp_t", "times"];
            intervals.forEach(function(key)
            {
                player_match[key] = player_match[key].filter(function(el, i)
                {
                    return player_match.times[i] >= 0;
                });
            });
        }
        //compute damage to towers/rax/roshan
        if (player_match.damage)
        {
            //npc_dota_goodguys_tower2_top
            //npc_dota_goodguys_melee_rax_top
            //npc_dota_roshan
            //npc_dota_neutral_giant_wolf
            //npc_dota_creep
            player_match.objective_damage = {};
            for (var key in player_match.damage)
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
                player_match.objective_damage[identifier] = player_match.objective_damage[identifier] ? player_match.objective_damage[identifier] + player_match.damage[key] : player_match.damage[key];
            }
        }
    });
    console.time("generating player analysis");
    m.players.forEach(function(player_match, i)
    {
        player_match.analysis = generatePlayerAnalysis(m, player_match);
    });
    console.timeEnd("generating player analysis");
    if (m.chat)
    {
        //make a list of messages and join them all together for sentiment analysis
        var chat_words = m.chat.map(function(message)
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
            "mad": -1
        });
    }
    //create gold breakdown data
    if (m.players[0].gold_reasons)
    {
        m.incomeData = generateIncomeData(m);
        //m.treeMapData = generateTreemapData(m);
    }
    //create graph data
    if (m.players[0].gold_t)
    {
        m.graphData = generateGraphData(m);
    }
    //create heatmap data
    m.posData = m.players.map(function(p)
    {
        return p.posData;
    });
    //process objectives
    if (m.objectives)
    {
        m.objectives.forEach(function(entry)
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
        m.teamfights.forEach(function(tf)
        {
            tf.posData = [];
            tf.radiant_gold_delta = 0;
            tf.radiant_xp_delta = 0;
            tf.radiant_participation = 0;
            tf.radiant_deaths = 0;
            tf.dire_participation = 0;
            tf.dire_deaths = 0;
            tf.players.forEach(function(p)
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
            m.players.forEach(function(p, i)
            {
                var tfplayer = tf.players[p.player_slot % (128 - 5)];
                tfplayer.hero_id = p.hero_id;
                tfplayer.player_slot = p.player_slot;
                tfplayer.isRadiant = isRadiant(p);
                tfplayer.personaname = p.personaname;
                tfplayer.account_id = p.account_id;
                tfplayer.participate = tfplayer.deaths > 0 || tfplayer.damage > 0;
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
                tfplayer.posData.deaths_pos.forEach(function(pt)
                {
                    pt.hero_id = tfplayer.hero_id;
                    tf.posData.push(pt);
                });
            });
        });
    }
}
/**
 * Generates a player analysis for a player_match
 * Returns an analysis object
 **/
function generatePlayerAnalysis(match, pm)
{
    //define condition check for each advice point
    var advice = {};
    var checks = {
        //LH@10
        lh: function(m, pm)
        {
            var lh = pm.lh_t ? pm.lh_t[10] : undefined;
            return {
                abbr: "LH",
                name: "Last hits at 10 minutes",
                template: util.format("<b>%s</b>", lh),
                value: lh,
                advice: "Consider practicing your last-hitting in order to improve your farm.  If you're struggling in lane, consider asking for a rotation from your team.",
                category: "warning",
                icon: "fa-usd",
                valid: lh !== undefined && !isSupport(pm),
                score: function(raw)
                {
                    return raw;
                },
                top: 50
            };
        },
        //farming drought (low gold earned delta over an interval)
        farm_drought: function(m, pm)
        {
            var delta = Number.MAX_VALUE;
            var interval = 5;
            var start = 0;
            if (pm.gold_t)
            {
                for (var i = 0; i < pm.gold_t.length - interval; i++)
                {
                    var diff = pm.gold_t[i + interval] - pm.gold_t[i];
                    if (i > 5 && diff < delta)
                    {
                        delta = diff;
                        start = i;
                    }
                }
            }
            return {
                abbr: "DROUGHT",
                name: "Worst GPM over 5 minutes",
                template: util.format("<b>%s</b> at <b>%s</b> minutes", (delta / interval).toFixed(0), start),
                value: delta / interval,
                advice: "Keep finding ways to obtain farm in order to stay competitive with the opposing team.",
                category: "warning",
                icon: "fa-line-chart",
                valid: Boolean(start),
                score: function(raw)
                {
                    return raw;
                },
                top: isSupport(pm) ? 150 : 300
            };
        },
        //Flaming in all chat
        flaming: function(m, pm)
        {
            var flames = 0;
            var words = [
                "fuck",
                "shit"
            ];
            if (pm.my_word_counts)
            {
                for (var key in pm.my_word_counts)
                {
                    if (words.some(function(w)
                        {
                            return key.indexOf(w) !== -1;
                        }))
                    {
                        flames += pm.my_word_counts[key];
                    }
                }
            }
            return {
                abbr: "FLAME",
                name: "Profanities used",
                template: util.format("<b>%s</b>", flames),
                value: flames,
                advice: "Keep calm in all chat in order to improve the overall game experience.",
                category: "danger",
                icon: "fa-fire",
                valid: Boolean(pm.my_word_counts),
                score: function(raw)
                {
                    return 5 - raw;
                },
                top: 0
            };
        },
        //Courier feeding
        courier_feeding: function(m, pm)
        {
            var couriers = pm.purchase && pm.purchase.courier ? pm.purchase.courier : 0;
            return {
                abbr: "CFEED",
                name: "Couriers fed",
                template: util.format("<b>%s</b>", couriers),
                value: couriers,
                advice: "Try not to make your team's situation worse by buying and feeding couriers.  Comebacks are always possible!",
                category: "danger",
                icon: "fa-cutlery",
                valid: Boolean(pm.purchase),
                score: function(raw)
                {
                    return raw > 2 ? 0 : 1;
                },
                top: 0
            };
        },
        //low ability accuracy (custom list of skillshots)
        skillshot: function(m, pm)
        {
            var acc;
            if (pm.ability_uses && pm.hero_hits)
            {
                for (var key in pm.ability_uses)
                {
                    if (key in constants.skillshots)
                    {
                        acc = pm.hero_hits[key] / pm.ability_uses[key];
                    }
                }
            }
            return {
                abbr: "SKILLSHOT",
                name: "Skillshots landed",
                template: util.format("<b>%s</b>", acc ? acc.toFixed(2) : ""),
                value: acc,
                advice: "Practicing your skillshots can improve your match performance.",
                category: "info",
                icon: "fa-bullseye",
                valid: acc !== undefined,
                score: function(raw)
                {
                    return raw || 0;
                },
                top: 0.5
            };
        },
        //courier buy delay (3 minute flying)
        late_courier: function(m, pm)
        {
            var flying_available = 180;
            var time;
            if (pm.purchase && pm.purchase.flying_courier)
            {
                time = pm.purchase_time.flying_courier;
            }
            return {
                abbr: "FCOURIER",
                name: "Courier upgrade delay",
                template: util.format("<b>%s</b> seconds", time - flying_available),
                value: time - flying_available,
                advice: "Upgrade your team's courier as soon as possible to speed up item delivery.",
                category: "info",
                icon: "fa-level-up",
                valid: time !== undefined,
                score: function(raw)
                {
                    return 60 - raw;
                },
                top: 10
            };
        },
        //low obs wards/min
        wards: function(m, pm)
        {
            var ward_cooldown = 60 * 7;
            var wards = pm.obs_log ? pm.obs_log.length : 0;
            //divide game length by ward cooldown
            //2 wards respawn every interval
            //split responsibility between 2 supports
            var max_placed = m.duration / ward_cooldown * 2 / 2;
            return {
                abbr: "OBS",
                name: "Wards placed",
                template: util.format("<b>%s</b>", wards),
                value: wards,
                advice: "Keep wards placed constantly to give your team vision.",
                category: "info",
                icon: "fa-eye",
                valid: isSupport(pm),
                score: function(raw)
                {
                    return raw / max_placed
                },
                top: max_placed
            };
        },
        //roshan opportunities (specific heroes)
        roshan: function(m, pm)
        {
            var rosh_taken = 0;
            if (isRoshHero(pm) && m.objectives)
            {
                for (var i = 0; i < m.objectives.length; i++)
                {
                    //first 20 minutes
                    if (m.objectives[i].time > 60 * 20)
                    {
                        break;
                    }
                    if (m.objectives[i].type === "CHAT_MESSAGE_ROSHAN_KILL" && m.objectives[i].team === (isRadiant(pm) ? 2 : 3))
                    {
                        rosh_taken += 1;
                    }
                }
            }
            return {
                abbr: "ROSHAN",
                name: "Roshan taken early",
                template: util.format("<b>%s</b>", rosh_taken),
                value: rosh_taken,
                advice: "Certain heroes can take Roshan early for an early-game advantage.",
                category: "primary",
                icon: "fa-shield",
                valid: isRoshHero(pm),
                score: function(raw)
                {
                    return raw;
                },
                top: 1
            };
        },
        //rune control (mid player)
        rune_control: function(m, pm)
        {
            var runes;
            if (pm.runes)
            {
                runes = 0;
                for (var key in pm.runes)
                {
                    runes += pm.runes[key];
                }
            }
            return {
                abbr: "RUNES",
                name: "Runes obtained",
                template: util.format("<b>%s</b>", runes),
                value: runes,
                advice: "Maintain rune control in order to give your team an advantage.",
                category: "primary",
                icon: "fa-battery-4",
                valid: runes !== undefined && pm.lane_role === 2,
                score: function(raw)
                {
                    return raw;
                },
                top: 10
            };
        },
        //unused item actives (multiple results?)
        unused_item: function(m, pm)
        {
            var result = [];
            if (pm.purchase)
            {
                for (var key in pm.purchase)
                {
                    if (pm.purchase[key] && (pm.item_uses[key] || 0) < 1 && constants.items[key] && isActiveItem(key))
                    {
                        //if item has cooldown, consider it usable
                        result.push("<img title='" + key + "' class='item img-sm' src='" + constants.items[key].img + "' />");
                    }
                }
            }
            return {
                abbr: "ITEMUSE",
                name: "Unused active items",
                template: util.format("%s", result.length ? result.join("") : 0),
                value: result.length,
                advice: "Make sure to use your item actives in order to fully utilize your investment.",
                category: "success",
                icon: "fa-bolt",
                valid: pm.purchase,
                score: function(raw)
                {
                    return 5 - raw;
                },
                top: 0
            };
        }
    };
    for (var key in checks)
    {
        advice[key] = checks[key](match, pm);
        var val = advice[key];
        val.display = util.format("%s: %s, expected <b>%s</b>", val.name, val.template, Number(val.top.toFixed(2)));
        val.pct = val.score(val.value)/val.score(val.top);
        delete val.score;
        pm.desc = [constants.lane_role[pm.lane_role], isSupport(pm) ? "Support" : "Core"].join("/");
    }
    return advice;

    function isSupport(pm)
    {
        return pm.obs_log && pm.obs_log.length >= 2 && pm.lh_t && pm.lh_t[10] < 20;
    }

    function isRoshHero(pm)
    {
        var rosh_heroes = {
            "npc_dota_hero_lycan": 1,
            "npc_dota_hero_ursa": 1,
            "npc_dota_hero_troll_warlord": 1
        };
        return constants.heroes[pm.hero_id] && (constants.heroes[pm.hero_id].name in rosh_heroes);
    }

    function isActiveItem(key)
    {
        return (constants.items[key].desc.substring(0, "Active".length) === "Active" && key !== "branches");
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
    match.players.forEach(function(p, i)
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
    orderedPlayers.sort(function(a, b)
    {
        return b.gold_per_min - a.gold_per_min;
    });
    orderedPlayers.forEach(function(player)
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
        orderedPlayers.forEach(function(player)
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

function generateTreemapData(match)
{
    var data = [];
    match.players.forEach(function(player)
    {
        var hero = constants.heroes[player.hero_id] ||
        {};
        data.push(
        {
            name: hero.localized_name,
            id: player.hero_id.toString(),
            value: ~~(player.gold_per_min * match.duration / 60)
        });
    });
    for (var key in constants.gold_reasons)
    {
        var reason = constants.gold_reasons[key].name;
        match.players.forEach(function(player)
        {
            var g = player.gold_reasons;
            data.push(
            {
                name: reason,
                parent: player.hero_id.toString(),
                value: g[key] || 0
            });
        });
    }
    return data;
}
module.exports = {
    renderMatch: renderMatch,
    computeMatchData: computeMatchData,
    computePlayerMatchData: computePlayerMatchData
};
