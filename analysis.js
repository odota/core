var util = require('util');
var constants = require('./constants.js');
module.exports = generatePlayerAnalysis;
/**
 * Generates a player analysis for a player_match
 * Returns an analysis object
 **/
function generatePlayerAnalysis(match, pm)
{
    //define condition check for each advice point
    var advice = {};
    var checks = {
        //EFF@10
        eff: function(m, pm)
        {
            var eff = pm.lane_efficiency ? pm.lane_efficiency : undefined;
            return {
                grade: true,
                name: "Lane efficiency at 10 minutes",
                value: eff,
                top: isSupport(pm) ? 0.3 : pm.lane_role === 3 ? 0.4 : 0.6,
                advice: "Consider practicing your last-hitting in order to improve your farm.  If you're struggling in lane, consider asking for a rotation from your team.  If playing a support, stack and pull to obtain farm.",
                category: "warning",
                icon: "fa-usd",
                valid: eff !== undefined,
                score: function(raw)
                {
                    return raw;
                },
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
                grade: true,
                name: "Lowest GPM in 5 minute interval",
                suffix: util.format("(<b>%s</b> minutes)", start),
                value: delta / interval,
                top: isSupport(pm) ? 150 : 300,
                advice: "Keep finding ways to obtain farm in order to stay competitive with the opposing team.",
                category: "warning",
                icon: "fa-line-chart",
                valid: Boolean(start),
                score: function(raw)
                {
                    return raw;
                }
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
                name: "Profanities used",
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
            var couriers = pm.purchase && pm.purchase.courier ? Math.max(pm.purchase.courier - 2, 0) : 0;
            return {
                name: "Couriers bought and fed",
                value: couriers,
                advice: "Try not to make your team's situation worse by buying and feeding couriers.  Comebacks are always possible!",
                category: "danger",
                icon: "fa-cutlery",
                valid: Boolean(pm.purchase),
                score: function(raw)
                {
                    return raw ? 0 : 1;
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
                grade: true,
                abbr: "SKILLSHOT",
                name: "Skillshots landed",
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
            if (pm.purchase && pm.purchase.flying_courier && pm.purchase_time)
            {
                time = pm.purchase_time.flying_courier;
            }
            return {
                grade: true,
                name: "Courier upgrade delay",
                value: time - flying_available,
                advice: "Upgrade your team's courier as soon as possible to speed up item delivery.",
                category: "info",
                icon: "fa-level-up",
                valid: time !== undefined,
                score: function(raw)
                {
                    return 180 - raw;
                },
                top: 30
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
                grade: true,
                name: "Wards placed",
                value: wards,
                advice: "Keep wards placed constantly to give your team vision.",
                category: "info",
                icon: "fa-eye",
                valid: isSupport(pm),
                score: function(raw)
                {
                    return raw / max_placed;
                },
                top: max_placed
            };
        },
        //roshan opportunities (specific heroes)
        roshan: function(m, pm)
        {
            var rosh_taken = 0;
            if (isRoshHero(pm) && pm.killed)
            {
                rosh_taken = pm.killed.npc_dota_roshan || 0;
            }
            return {
                name: "Roshans killed",
                value: rosh_taken,
                advice: "Certain heroes can take Roshan for an early-game advantage.",
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
            var target = match.duration / 60 / 4;
            return {
                grade: true,
                name: "Runes obtained",
                value: runes,
                advice: "Maintain rune control in order to give your team an advantage.",
                category: "primary",
                icon: "fa-battery-4",
                valid: runes !== undefined && pm.lane_role === 2,
                score: function(raw)
                {
                    return raw / target;
                },
                top: target
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
                    if (pm.purchase[key] && getGroupedItemUses(key) < 1 && constants.items[key] && isActiveItem(key))
                    {
                        //if item has cooldown, consider it usable
                        result.push("<img title='" + key + "' class='item img-sm' src='" + constants.items[key].img + "' />");
                    }
                }
            }

            function getGroupedItemUses(key)
            {
                var total = 0;
                for (var key2 in pm.item_uses)
                {
                    if (key === key2 || constants.item_groups.some(function(g)
                        {
                            return (key in g) && (key2 in g);
                        }))
                    {
                        total += pm.item_uses[key];
                    }
                }
                return total;
            }
            return {
                abbr: "ITEMUSE",
                name: "Unused active items",
                suffix: util.format("%s", result.length ? result.join("") : 0),
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
        val.display = util.format("%s: <b>%s</b>, expected <b>%s</b>", val.name, Number(val.value ? val.value.toFixed(2) : ""), Number(val.top.toFixed(2)));
        val.display += (val.suffix ? " " + val.suffix : "");
        val.pct = val.score(val.value) / val.score(val.top);
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
        var whitelist = {
            "branches": 1,
            "bloodstone": 1,
            "radiance": 1
        };
        return (constants.items[key].desc.indexOf("Active: ") > -1 && !(key in whitelist));
    }
}
