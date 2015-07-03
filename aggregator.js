var constants = require('./constants.json');
var utility = require('./utility');
var isRadiant = utility.isRadiant;
var mergeObjects = utility.mergeObjects;

module.exports = function aggregator(matches, fields) {
    var aggData = {};
    var types = {
        "heroes": function(key, m, p) {
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
            var p = m.players[0];
            var player_win = isRadiant(p) === m.radiant_win;
            for (var j = 0; j < m.all_players.length; j++) {
                var tm = m.all_players[j];
                var tm_hero = tm.hero_id;
                if (tm_hero in heroes) {
                    //don't count invalid heroes
                    if (isRadiant(tm) === isRadiant(p)) {
                        //count teammate heroes
                        if (tm.account_id === p.account_id) {
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
        },
        "teammates": function(key, m, p) {
            var teammates = aggData.teammates;
            var p = m.players[0];
            var player_win = isRadiant(p) === m.radiant_win;
            for (var j = 0; j < m.all_players.length; j++) {
                var tm = m.all_players[j];
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
                if (isRadiant(tm) === isRadiant(p)) {
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
        },
        "win": function(key, m, p) {
            aggData[key] += (m.player_win) ? 1 : 0;
        },
        "lose": function(key, m, p) {
            aggData[key] += (m.player_win) ? 0 : 1;
        },
        "games": function(key, m, p) {
            aggData[key] += 1;
        },
        "start_time": function(key, m, p) {
            standardAgg(key, m.start_time, m);
        },
        "duration": function(key, m, p) {
            standardAgg(key, m.duration, m);
        },
        "cluster": function(key, m, p) {
            standardAgg(key, m.cluster, m);
        },
        "region": function(key, m, p) {
            standardAgg(key, m.region, m);
        },
        "patch": function(key, m, p) {
            standardAgg(key, m.patch, m);
        },
        "first_blood_time": function(key, m, p) {
            standardAgg(key, m.first_blood_time, m);
        },
        "lobby_type": function(key, m, p) {
            standardAgg(key, m.lobby_type, m);
        },
        "game_mode": function(key, m, p) {
            standardAgg(key, m.game_mode, m);
        },
        "hero_id": function(key, m, p) {
            standardAgg(key, p.hero_id, m);
        },
        "level": function(key, m, p) {
            standardAgg(key, p.level, m);
        },
        //numeric values
        "kills": function(key, m, p) {
            standardAgg(key, p.kills, m);
        },
        "deaths": function(key, m, p) {
            standardAgg(key, p.deaths, m);
        },
        "assists": function(key, m, p) {
            standardAgg(key, p.assists, m);
        },
        "last_hits": function(key, m, p) {
            standardAgg(key, p.last_hits, m);
        },
        "denies": function(key, m, p) {
            standardAgg(key, p.denies, m);
        },
        "total_gold": function(key, m, p) {
            standardAgg(key, p.total_gold, m);
        },
        "total_xp": function(key, m, p) {
            standardAgg(key, p.total_xp, m);
        },
        "hero_damage": function(key, m, p) {
            standardAgg(key, p.hero_damage, m);
        },
        "tower_damage": function(key, m, p) {
            standardAgg(key, p.tower_damage, m);
        },
        "hero_healing": function(key, m, p) {
            standardAgg(key, p.hero_healing, m);
        },
        "courier_kills": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.courier_kills, m);
        },
        "tower_kills": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.tower_kills, m);
        },
        "neutral_kills": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.neutral_kills, m);
        },
        "buyback_count": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.buyback_count, m);
        },
        /*
        //no longer accurate in 6.84 due to ability to use wards from stack
        //alternatives include counting purchases or checking length of ward positions object
        "observer_uses": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.observer_uses, m);
        },
        "sentry_uses": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.sentry_uses, m);
        },
        */
        "stuns": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.stuns, m);
        },
        //per minute values
        "kills_per_min": function(key, m, p) {
            standardAgg(key, p.kills / (m.duration / 60), m);
        },
        "deaths_per_min": function(key, m, p) {
            standardAgg(key, p.deaths / (m.duration / 60), m);
        },
        "assists_per_min": function(key, m, p) {
            standardAgg(key, p.assists / (m.duration / 60), m);
        },
        "last_hits_per_min": function(key, m, p) {
            standardAgg(key, p.last_hits / (m.duration / 60), m);
        },
        "gold_per_min": function(key, m, p) {
            standardAgg(key, p.gold_per_min, m);
        },
        "xp_per_min": function(key, m, p) {
            standardAgg(key, p.xp_per_min, m);
        },
        "hero_damage_per_min": function(key, m, p) {
            standardAgg(key, p.hero_damage / (m.duration / 60), m);
        },
        "tower_damage_per_min": function(key, m, p) {
            standardAgg(key, p.tower_damage / (m.duration / 60), m);
        },
        "hero_healing_per_min": function(key, m, p) {
            standardAgg(key, p.hero_healing / (m.duration / 60), m);
        },
        //categorical values
        "leaver_status": function(key, m, p) {
            standardAgg(key, p.leaver_status, m);
        },
        "isRadiant": function(key, m, p) {
            standardAgg(key, isRadiant(p), m);
        },
        "lane": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.lane, m);
        },
        "lane_role": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.lane_role, m);
        },
        //lifetime ward positions
        "obs": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.obs, m);
        },
        "sen": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.sen, m);
        },
        //lifetime rune counts
        "runes": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.runes, m);
        },
        //lifetime item uses
        "item_uses": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.item_uses, m);
        },
        //track sum of purchase times and counts to get average build time
        "purchase_time": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.purchase_time, m);
        },
        "purchase_time_count": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.purchase_time_count, m);
        },
        //lifetime item purchases
        "purchase": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.purchase, m);
        },
        "kills_count": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.kills, m);
        },
        "gold_reasons": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.gold_reasons, m);
        },
        "xp_reasons": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.xp_reasons, m);
        },
        //lifetime skill accuracy
        "ability_uses": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.ability_uses, m);
        },
        "hero_hits": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.hero_hits, m);
        },
        "multi_kills": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.multi_kills, m);
        },
        "kill_streaks": function(key, m, p) {
            standardAgg(key, p.parsedPlayer.kill_streaks, m);
        },
        "all_word_counts": function(key, m, p) {
            standardAgg(key, m.all_word_counts, m);
        },
        "my_word_counts": function(key, m, p) {
            standardAgg(key, m.my_word_counts, m);
        }
    };
    //if fields passed in is null, do all aggregations
    fields = fields || types;
    //ensure aggData isn't null for each requested aggregation field
    for (var key in fields) {
        //basic counts
        if (key === "win" || key === "lose" || key === "games") {
            aggData[key] = 0;
        }
        //track unique ids
        else if (key === "teammates" || key === "heroes") {
            aggData[key] = {};
        }
        //standard aggregation
        else {
            aggData[key] = {
                sum: 0,
                min: Number.MAX_VALUE,
                max: 0,
                max_match: null,
                n: 0,
                counts: {},
                win_counts: {}
            };
        }
    }
    for (var i = 0; i < matches.length; i++) {
        var m = matches[i];
        var p = m.players[0];
        for (var key in fields) {
            //execute the aggregation function for each specified field
            if (types[key]) {
                types[key](key, m, p);
            }
        }
    }
    return aggData;

    function standardAgg(key, value, match) {
        var aggObj = aggData[key];
        if (typeof value === "undefined") {
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
                    hero_id: match.players[0].hero_id
                };
            }
        }
    }
}