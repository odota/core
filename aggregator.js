var constants = require('./constants.js');
var utility = require('./utility');
var isRadiant = utility.isRadiant;
var mergeObjects = utility.mergeObjects;
var isSignificant = utility.isSignificant;
module.exports = function aggregator(matches, fields, existing)
{
    fields = fields || getAggs();
    //ensure aggData isn't null for each requested aggregation field
    var aggData = existing ||
    {
        teammates:
        {},
        heroes:
        {},
        match_ids:
        {},
        parsed_match_ids:
        {},
        matches:
        {},
    };
    for (var key in fields)
    {
        //if we don't have a cached aggregation for this field, replace with empty one
        if (!aggData[key])
        {
            aggData[key] = {
                sum: 0,
                max: 0,
                max_match:
                {},
                n: 0,
                counts:
                {},
                win_counts:
                {},
                avgs: [],
            };
        }
    }
    //sort ascending to support trends
    matches.sort(function (a, b)
    {
        return Number(a.match_id) - Number(b.match_id);
    });
    for (var i = 0; i < matches.length; i++)
    {
        var m = matches[i];
        var reApi = (m.match_id in aggData.match_ids) && getAggs()[key] === "api";
        var reParse = (m.match_id in aggData.parsed_match_ids) && getAggs()[key] === "parsed";
        if (isSignificant(constants, m) && !reApi && !reParse)
        {
            for (var key in fields)
            {
                //execute the aggregation function for each specified field
                standardAgg(key, m[key], m);
            }
        }
        aggData.match_ids[m.match_id] = 1;
        if (m.version)
        {
            aggData.parsed_match_ids[m.match_id] = 1;
        }
        //reduce match to save cache space--we only need basic data per match for matches tab
        var reduced_player_match = reduceMinimal(m);
        var identifier = [m.match_id, m.player_slot].join(':');
        var orig = aggData.matches[identifier];
        if (orig)
        {
            //iterate instead of setting directly to avoid clobbering existing data
            for (var key in reduced_player_match)
            {
                orig[key] = reduced_player_match[key] || orig[key];
            }
        }
        else
        {
            aggData.matches[identifier] = reduced_player_match;
        }
    }
    return aggData;

    function standardAgg(key, value, match)
    {
        if (key === "heroes")
        {
            return aggHeroes(aggData, match);
        }
        if (key === "teammates")
        {
            return aggTeammates(aggData, match);
        }
        var aggObj = aggData[key];
        if (typeof value === "undefined" || value === null)
        {
            return;
        }
        aggObj.n += 1;
        if (typeof value === "object")
        {
            mergeObjects(aggObj.counts, value);
        }
        else
        {
            value = ~~Number(value);
            if (!aggObj.counts[value])
            {
                aggObj.counts[value] = 0;
                aggObj.win_counts[value] = 0;
            }
            aggObj.counts[value] += 1;
            if (isRadiant(match) === match.radiant_win)
            {
                aggObj.win_counts[value] += 1;
            }
            aggObj.sum += (value || 0);
            if (value > aggObj.max)
            {
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
};

function aggHeroes(aggData, m)
{
    var heroes = aggData.heroes;
    if (Object.keys(heroes).length !== Object.keys(constants.heroes).length)
    {
        //prefill heroes with every hero
        for (var hero_id in constants.heroes)
        {
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
    var group = m.heroes ||
    {};
    for (var key in group)
    {
        var tm = group[key];
        var tm_hero = tm.hero_id;
        //don't count invalid heroes
        if (tm_hero in heroes)
        {
            if (isRadiant(tm) === isRadiant(m))
            {
                //count teammate heroes
                if (tm.account_id === m.account_id)
                {
                    //console.log("self %s", tm_hero);
                    heroes[tm_hero].games += 1;
                    heroes[tm_hero].win += player_win ? 1 : 0;
                    if (m.start_time > heroes[tm_hero].last_played)
                    {
                        heroes[tm_hero].last_played = m.start_time;
                    }
                }
                else
                {
                    //console.log("teammate %s", tm_hero);
                    heroes[tm_hero].with_games += 1;
                    heroes[tm_hero].with_win += player_win ? 1 : 0;
                }
            }
            else
            {
                //count enemy heroes
                //console.log("opp %s", tm_hero);
                heroes[tm_hero].against_games += 1;
                heroes[tm_hero].against_win += player_win ? 1 : 0;
            }
        }
    }
}

function aggTeammates(aggData, m)
{
    var teammates = aggData.teammates;
    var player_win = isRadiant(m) === m.radiant_win;
    var group = m.teammates ||
    {};
    for (var key in group)
    {
        var tm = group[key];
        //count teammate players
        if (!teammates[tm.account_id])
        {
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
        if (m.start_time > teammates[tm.account_id].last_played)
        {
            teammates[tm.account_id].last_played = m.start_time;
        }
        //played with
        teammates[tm.account_id].games += 1;
        teammates[tm.account_id].win += player_win ? 1 : 0;
        if (isRadiant(tm) === isRadiant(m))
        {
            //played with
            teammates[tm.account_id].with_games += 1;
            teammates[tm.account_id].with_win += player_win ? 1 : 0;
        }
        else
        {
            //played against
            teammates[tm.account_id].against_games += 1;
            teammates[tm.account_id].against_win += player_win ? 1 : 0;
        }
    }
}
//reduce match to only fields needed for basic display
function reduceMinimal(pm)
{
    return {
        match_id: pm.match_id,
        player_slot: pm.player_slot,
        hero_id: pm.hero_id,
        game_mode: pm.game_mode,
        kills: pm.kills,
        deaths: pm.deaths,
        assists: pm.assists,
        last_hits: pm.last_hits,
        gold_per_min: pm.gold_per_min,
        parse_status: pm.parse_status,
        skill: pm.skill,
        player_win: pm.player_win,
        start_time: pm.start_time,
        duration: pm.duration
    };
}

function getAggs()
{
    return {
        match_id: "api",
        player_slot: "api",
        account_id: "api",
        heroes: "api",
        teammates: "api",
        win: "api",
        lose: "api",
        radiant_win: "api",
        player_win: "api",
        abandons: "api",
        start_time: "api",
        duration: "api",
        cluster: "api",
        region: "api",
        patch: "api",
        first_blood_time: "api",
        lobby_type: "api",
        game_mode: "api",
        level: "api",
        kills: "api",
        deaths: "api",
        assists: "api",
        kda: "api",
        last_hits: "api",
        denies: "api",
        hero_damage: "api",
        tower_damage: "api",
        hero_healing: "api",
        //kills_per_min: "api",
        gold_per_min: "api",
        xp_per_min: "api",
        hero_id: "api",
        leaver_status: "api",
        isRadiant: "api",
        version: "parsed",
        courier_kills: "parsed",
        tower_kills: "parsed",
        neutral_kills: "parsed",
        lane: "parsed",
        lane_role: "parsed",
        obs: "parsed",
        sen: "parsed",
        item_uses: "parsed",
        purchase_time: "parsed",
        item_usage: "parsed",
        item_win: "parsed",
        purchase: "parsed",
        ability_uses: "parsed",
        hero_hits: "parsed",
        multi_kills: "parsed",
        kill_streaks: "parsed",
        all_word_counts: "parsed",
        my_word_counts: "parsed",
        "throw": "parsed",
        comeback: "parsed",
        stomp: "parsed",
        loss: "parsed",
        actions_per_min: "parsed",
        purchase_ward_observer: "parsed",
        purchase_ward_sentry: "parsed",
        purchase_tpscroll: "parsed",
        purchase_rapier: "parsed",
        purchase_gem: "parsed",
        pings: "parsed",
        stuns: "parsed",
        lane_efficiency_pct: "parsed"
    };
}
//reduce match to only fields needed for aggregation/filtering
function reduceAggregable(pm)
{
    var result = {};
    for (var key in getAggs())
    {
        result[key] = pm[key];
    }
    return result;
}