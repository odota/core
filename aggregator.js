var constants = require('./constants.js');
var utility = require('./utility');
var isRadiant = utility.isRadiant;
var mergeObjects = utility.mergeObjects;
var isSignificant = utility.isSignificant;
var getAggs = utility.getAggs;
var reduceMinimal = utility.reduceMinimal;
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
    matches.sort(function(a, b)
    {
        return Number(a.match_id) - Number(b.match_id);
    });
    for (var i = 0; i < matches.length; i++)
    {
        var m = matches[i];
        var significant = isSignificant(constants, m);
        for (var key in fields)
        {
            var isDup = false;
            if (getAggs()[key] === "api")
            {
                isDup = isDup || (m.match_id in aggData.match_ids);
            }
            else if (getAggs()[key] === "parsed")
            {
                isDup = isDup || (m.match_id in aggData.parsed_match_ids);
            }
            if (significant && !isDup)
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
            value = ~~value;
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