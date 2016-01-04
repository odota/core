var constants = require('./constants.js');
var utility = require('./utility');
var isRadiant = utility.isRadiant;
var mergeObjects = utility.mergeObjects;
var isSignificant = utility.isSignificant;
module.exports = function aggregator(matches, fields, existing) {
    var types = {
        "heroes": {
            type: "api",
            agg: function(key, m) {
                aggHeroes(key, m);
            }
        },
        "teammates": {
            type: "api",
            agg: function(key, m) {
                aggTeammates(key, m);
            }
        },
        //w/l counts
        "win": {
            type: "api",
            agg: function(key, m) {
                aggData[key] += (isRadiant(m) === m.radiant_win) ? 1 : 0;
            }
        },
        "lose": {
            type: "api",
            agg: function(key, m) {
                aggData[key] += (isRadiant(m) === m.radiant_win) ? 0 : 1;
            }
        },
        "games": {
            type: "api",
            agg: function(key, m) {
                aggData[key] += 1;
            }
        },
        //match values
        "match_ids": {
            type: "api",
            agg: function(key, m) {
                aggData[key][m.match_id] = 1;
            }
        },
        "start_time": {
            type: "api",
            agg: function(key, m) {
                standardAgg(key, m.start_time, m);
            }
        },
        "duration": {
            type: "api",
            agg: function(key, m) {
                standardAgg(key, m.duration, m);
            }
        },
        "cluster": {
            type: "api",
            agg: function(key, m) {
                standardAgg(key, m.cluster, m);
            }
        },
        "region": {
            type: "api",
            agg: function(key, m) {
                standardAgg(key, m.region, m);
            }
        },
        "patch": {
            type: "api",
            agg: function(key, m) {
                standardAgg(key, m.patch, m);
            }
        },
        "first_blood_time": {
            type: "api",
            agg: function(key, m) {
                standardAgg(key, m.first_blood_time, m);
            }
        },
        "lobby_type": {
            type: "api",
            agg: function(key, m) {
                standardAgg(key, m.lobby_type, m);
            }
        },
        "game_mode": {
            type: "api",
            agg: function(key, m) {
                standardAgg(key, m.game_mode, m);
            }
        },
        //player numeric values
        "level": {
            type: "api",
            agg: function(key, m) {
                standardAgg(key, m.level, m);
            }
        },
        "kills": {
            type: "api",
            agg: function(key, m) {
                standardAgg(key, m.kills, m);
            }
        },
        "deaths": {
            type: "api",
            agg: function(key, m) {
                standardAgg(key, m.deaths, m);
            }
        },
        "assists": {
            type: "api",
            agg: function(key, m) {
                standardAgg(key, m.assists, m);
            }
        },
        "kda": {
            type: "api",
            agg: function(key, m) {
                standardAgg(key, m.kda, m);
            }
        },
        "last_hits": {
            type: "api",
            agg: function(key, m) {
                standardAgg(key, m.last_hits, m);
            }
        },
        "denies": {
            type: "api",
            agg: function(key, m) {
                standardAgg(key, m.denies, m);
            }
        },
        "total_gold": {
            type: "api",
            agg: function(key, m) {
                standardAgg(key, m.total_gold, m);
            }
        },
        "total_xp": {
            type: "api",
            agg: function(key, m) {
                standardAgg(key, m.total_xp, m);
            }
        },
        "hero_damage": {
            type: "api",
            agg: function(key, m) {
                standardAgg(key, m.hero_damage, m);
            }
        },
        "tower_damage": {
            type: "api",
            agg: function(key, m) {
                standardAgg(key, m.tower_damage, m);
            }
        },
        "hero_healing": {
            type: "api",
            agg: function(key, m) {
                standardAgg(key, m.hero_healing, m);
            }
        },
        //per minute values
        /*
        "kills_per_min": {
            type: "api",
            agg: function(key, m, p) {
                standardAgg(key, p.kills / (m.duration / 60), m);
            }
        },
        "deaths_per_min": {
            type: "api",
            agg: function(key, m, p) {
                standardAgg(key, p.deaths / (m.duration / 60), m);
            }
        },
        "assists_per_min": {
            type: "api",
            agg: function(key, m, p) {
                standardAgg(key, p.assists / (m.duration / 60), m);
            }
        },
        "last_hits_per_min": {
            type: "api",
            agg: function(key, m, p) {
                standardAgg(key, p.last_hits / (m.duration / 60), m);
            }
        },
        "hero_damage_per_min": {
            type: "api",
            agg: function(key, m, p) {
                standardAgg(key, p.hero_damage / (m.duration / 60), m);
            }
        },
        "tower_damage_per_min": {
            type: "api",
            agg: function(key, m, p) {
                standardAgg(key, p.tower_damage / (m.duration / 60), m);
            }
        },
        "hero_healing_per_min": {
            type: "api",
            agg: function(key, m, p) {
                standardAgg(key, p.hero_healing / (m.duration / 60), m);
            }
        },
        */
        "gold_per_min": {
            type: "api",
            agg: function(key, m) {
                standardAgg(key, m.gold_per_min, m);
            }
        },
        "xp_per_min": {
            type: "api",
            agg: function(key, m) {
                standardAgg(key, m.xp_per_min, m);
            }
        },
        //categorical values
        "hero_id": {
            type: "api",
            agg: function(key, m) {
                standardAgg(key, m.hero_id, m);
            }
        },
        "leaver_status": {
            type: "api",
            agg: function(key, m) {
                standardAgg(key, m.leaver_status, m);
            }
        },
        "isRadiant": {
            type: "api",
            agg: function(key, m) {
                standardAgg(key, isRadiant(m), m);
            }
        },
        //PARSED data aggregations below
        /*
        //ward uses no longer accurate >6.84 due to ability to use wards from stack
        //alternatives include counting purchases or checking length of ward positions object
        "observer_uses": function(key, m) {
            standardAgg(key, m.observer_uses, m);
        },
        "sentry_uses": function(key, m) {
            standardAgg(key, m.sentry_uses, m);
        },
        */
        "parsed_match_ids": {
            type: "parsed",
            agg: function(key, m) {
                if (m.version) {
                    aggData[key][m.match_id] = 1;
                }
            }
        },
        "stuns": {
            type: "parsed",
            agg: function(key, m) {
                //double invert to convert the float to an int so we can bucket better
                standardAgg(key, (typeof m.stuns === "number") ? ~~m.stuns : undefined, m);
            }
        },
        "courier_kills": {
            type: "parsed",
            agg: function(key, m) {
                standardAgg(key, m.courier_kills, m);
            }
        },
        "tower_kills": {
            type: "parsed",
            agg: function(key, m) {
                standardAgg(key, m.tower_kills, m);
            }
        },
        "neutral_kills": {
            type: "parsed",
            agg: function(key, m) {
                standardAgg(key, m.neutral_kills, m);
            }
        },
        "buyback_count": {
            type: "parsed",
            agg: function(key, m) {
                standardAgg(key, m.buyback_count, m);
            }
        },
        "lane": {
            type: "parsed",
            agg: function(key, m) {
                standardAgg(key, m.lane, m);
            }
        },
        "lane_role": {
            type: "parsed",
            agg: function(key, m) {
                standardAgg(key, m.lane_role, m);
            }
        },
        //lifetime ward positions
        "obs": {
            type: "parsed",
            agg: function(key, m) {
                standardAgg(key, m.obs, m);
            }
        },
        "sen": {
            type: "parsed",
            agg: function(key, m) {
                standardAgg(key, m.sen, m);
            }
        },
        //lifetime rune counts
        "runes": {
            type: "parsed",
            agg: function(key, m) {
                standardAgg(key, m.runes, m);
            }
        },
        //lifetime item uses
        "item_uses": {
            type: "parsed",
            agg: function(key, m) {
                standardAgg(key, m.item_uses, m);
            }
        },
        //track sum of purchase times and counts to get average build time
        "purchase_time": {
            type: "parsed",
            agg: function(key, m) {
                standardAgg(key, m.purchase_time, m);
            }
        },
        "item_usage": {
            type: "parsed",
            agg: function(key, m) {
                standardAgg(key, m.item_usage, m);
            }
        },
        "item_win": {
            type: "parsed",
            agg: function(key, m) {
                standardAgg(key, m.item_win, m);
            }
        },
        //lifetime item purchases
        "purchase": {
            type: "parsed",
            agg: function(key, m) {
                standardAgg(key, m.purchase, m);
            }
        },
        //lifetime skill accuracy
        "ability_uses": {
            type: "parsed",
            agg: function(key, m) {
                standardAgg(key, m.ability_uses, m);
            }
        },
        "hero_hits": {
            type: "parsed",
            agg: function(key, m) {
                standardAgg(key, m.hero_hits, m);
            }
        },
        "kills_count": {
            type: "parsed",
            agg: function(key, m) {
                standardAgg(key, m.kills, m);
            }
        },
        "gold_reasons": {
            type: "parsed",
            agg: function(key, m) {
                standardAgg(key, m.gold_reasons, m);
            }
        },
        "xp_reasons": {
            type: "parsed",
            agg: function(key, m) {
                standardAgg(key, m.xp_reasons, m);
            }
        },
        "multi_kills": {
            type: "parsed",
            agg: function(key, m) {
                standardAgg(key, m.multi_kills, m);
            }
        },
        "kill_streaks": {
            type: "parsed",
            agg: function(key, m) {
                standardAgg(key, m.kill_streaks, m);
            }
        },
        "all_word_counts": {
            type: "parsed",
            agg: function(key, m) {
                standardAgg(key, m.all_word_counts, m);
            }
        },
        "my_word_counts": {
            type: "parsed",
            agg: function(key, m) {
                standardAgg(key, m.my_word_counts, m);
            }
        },
        "purchase_tpscroll": {
            type: "parsed",
            agg: function(key, m) {
                standardAgg(key, m.purchase ? (m.purchase.tpscroll || 0) : undefined, m);
            }
        },
        "purchase_ward_observer": {
            type: "parsed",
            agg: function(key, m) {
                standardAgg(key, m.purchase ? (m.purchase.ward_observer || 0) : undefined, m);
            }
        },
        "purchase_ward_sentry": {
            type: "parsed",
            agg: function(key, m) {
                standardAgg(key, m.purchase ? (m.purchase.ward_sentry * 2 || 0) : undefined, m);
            }
        },
        "purchase_gem": {
            type: "parsed",
            agg: function(key, m) {
                standardAgg(key, m.purchase ? (m.purchase.gem || 0) : undefined, m);
            }
        },
        "purchase_rapier": {
            type: "parsed",
            agg: function(key, m) {
                standardAgg(key, m.purchase ? (m.purchase.rapier || 0) : undefined, m);
            }
        },
        "pings": {
            type: "parsed",
            agg: function(key, m) {
                standardAgg(key, m.pings ? (m.pings[0] || 0) : undefined, m);
            }
        },
        "throw": {
            type: "parsed",
            agg: function(key, m) {
                standardAgg(key, m.throw, m);
            }
        },
        "comeback": {
            type: "parsed",
            agg: function(key, m) {
                standardAgg(key, m.comeback, m);
            }
        },
        "stomp": {
            type: "parsed",
            agg: function(key, m) {
                standardAgg(key, m.stomp, m);
            }
        },
        "loss": {
            type: "parsed",
            agg: function(key, m) {
                standardAgg(key, m.loss, m);
            }
        },
        "lane_efficiency": {
            type: "parsed",
            agg: function(key, m) {
                standardAgg(key, m.lane_efficiency ? ~~(m.lane_efficiency * 100) : undefined, m);
            }
        },
        "actions_per_min": {
            type: "parsed",
            agg: function(key, m) {
                standardAgg(key, m.actions_per_min, m);
            }
        }
    };
    if (typeof fields === "string") {
        //do aggregations for only basic or only parsed data
        console.log("aggregating %s", fields);
        var t = {};
        for (var key in types) {
            if (types[key].type === fields) {
                t[key] = 1;
            }
        }
        fields = t;
    }
    else if (!fields) {
        console.log("aggregating all fields");
        //if null fields passed in, do all aggregations
        fields = types;
    }
    //ensure aggData isn't null for each requested aggregation field
    var aggData = existing || {};
    for (var key in fields) {
        //if we don't have a cached aggregation for this field, replace with empty ones
        if (!aggData[key]) {
            //basic counts
            if (key === "win" || key === "lose" || key === "games") {
                aggData[key] = 0;
            }
            //track unique ids
            else if (key === "teammates" || key === "heroes" || key === "match_ids" || key === "parsed_match_ids") {
                aggData[key] = {};
            }
            //standard aggregation
            else if (types[key]) {
                aggData[key] = {
                    sum: 0,
                    min: Number.MAX_VALUE,
                    max: 0,
                    max_match: {},
                    n: 0,
                    counts: {},
                    win_counts: {},
                    avgs: []
                };
            }
        }
    }
    //sort ascending to support trends
    matches.sort(function(a, b) {
        return Number(a.match_id) - Number(b.match_id);
    });
    for (var i = 0; i < matches.length; i++) {
        var m = matches[i];
        if (isSignificant(constants, m)) {
            for (var key in fields) {
                //execute the aggregation function for each specified field
                if (types[key]) {
                    types[key].agg(key, m);
                }
            }
        }
    }
    return aggData;

    function standardAgg(key, value, match) {
        var aggObj = aggData[key];
        //console.log(key, aggObj);
        if (typeof value === "undefined" || value === null) {
            return;
        }
        aggObj.n += 1;
        if (typeof value === "object") {
            mergeObjects(aggObj.counts, value);
        }
        else {
            if (!aggObj.counts[value]) {
                aggObj.counts[value] = 0;
                aggObj.win_counts[value] = 0;
            }
            aggObj.counts[value] += 1;
            if (match.player_win) {
                aggObj.win_counts[value] += 1;
            }
            aggObj.sum += (value || 0);
            if (value < aggObj.min) {
                aggObj.min = value;
            }
            if (value > aggObj.max) {
                aggObj.max = value;
                aggObj.max_match = {
                    match_id: match.match_id,
                    start_time: match.start_time,
                    hero_id: match.hero_id
                };
            }
            /*
            aggObj.avgs.push({
                //match_id: match.match_id,
                start_time: match.start_time,
                hero_id: m.hero_id,
                val: value,
                avg: ~~(aggObj.sum / aggObj.n * 100) / 100
            });
            */
            aggObj.avgs.push(~~(aggObj.sum / aggObj.n * 100) / 100);
        }
    }

    function aggHeroes(key, m) {
        var heroes = aggData.heroes;
        if (Object.keys(heroes).length !== Object.keys(constants.heroes).length) {
            //prefill heroes with every hero
            for (var hero_id in constants.heroes) {
                var hero = {
                    hero_id: hero_id,
                    last_played: 0,
                    games: 0,
                    win: 0,
                    with_games: 0,
                    with_win: 0,
                    against_games: 0,
                    against_win: 0
                };
                heroes[hero_id] = heroes[hero_id] || hero;
            }
        }
        var player_win = isRadiant(m) === m.radiant_win;
        var group = m.pgroup || {};
        for (var key in group) {
            var tm = group[key];
            var tm_hero = tm.hero_id;
            //don't count invalid heroes
            if (tm_hero in heroes) {
                if (isRadiant(tm) === isRadiant(m)) {
                    //count teammate heroes
                    if (tm.account_id === m.account_id) {
                        //console.log("self %s", tm_hero);
                        heroes[tm_hero].games += 1;
                        heroes[tm_hero].win += player_win ? 1 : 0;
                        if (m.start_time > heroes[tm_hero].last_played) {
                            heroes[tm_hero].last_played = m.start_time;
                        }
                    }
                    else {
                        //console.log("teammate %s", tm_hero);
                        heroes[tm_hero].with_games += 1;
                        heroes[tm_hero].with_win += player_win ? 1 : 0;
                    }
                }
                else {
                    //count enemy heroes
                    //console.log("opp %s", tm_hero);
                    heroes[tm_hero].against_games += 1;
                    heroes[tm_hero].against_win += player_win ? 1 : 0;
                }
            }
        }
    }

    function aggTeammates(key, m) {
        var teammates = aggData.teammates;
        var player_win = isRadiant(m) === m.radiant_win;
        var group = m.pgroup || {};
        for (var key in group) {
            var tm = group[key];
            //count teammate players
            if (!teammates[tm.account_id]) {
                teammates[tm.account_id] = {
                    account_id: tm.account_id,
                    last_played: 0,
                    win: 0,
                    games: 0,
                    with_win: 0,
                    with_games: 0,
                    against_win: 0,
                    against_games: 0
                };
            }
            if (m.start_time > teammates[tm.account_id].last_played) {
                teammates[tm.account_id].last_played = m.start_time;
            }
            //played with
            teammates[tm.account_id].games += 1;
            teammates[tm.account_id].win += player_win ? 1 : 0;
            if (isRadiant(tm) === isRadiant(m)) {
                //played with
                teammates[tm.account_id].with_games += 1;
                teammates[tm.account_id].with_win += player_win ? 1 : 0;
            }
            else {
                //played against
                teammates[tm.account_id].against_games += 1;
                teammates[tm.account_id].against_win += player_win ? 1 : 0;
            }
        }
    }
};
