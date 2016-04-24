var utility = require('../util/utility');
var isRadiant = utility.isRadiant;
module.exports = function filter(matches, filters)
{
    //accept a hash of filters, run all the filters in the hash in series
    //console.log(filters);
    var conditions = {
        //filter: player won
        win: function(m, key)
        {
            return Number(utility.isRadiant(m) === m.radiant_win) === key;
        },
        patch: function(m, key)
        {
            return m.patch === key;
        },
        game_mode: function(m, key)
        {
            return m.game_mode === key;
        },
        lobby_type: function(m, key)
        {
            return m.lobby_type === key;
        },
        region: function(m, key)
        {
            return m.region === key;
        },
        date: function(m, key)
        {
            return m.start_time > (curtime - (key * 86400));
        },
        hero_id: function(m, key)
        {
            return m.hero_id === key;
        },
        isRadiant: function(m, key)
        {
            return Number(m.isRadiant) === key;
        },
        included_account_id: function(m, key, arr)
        {
            return arr.every(function(k)
            {
                for (var key in m.pgroup)
                {
                    if (m.pgroup[key].account_id === k)
                    {
                        return true;
                    }
                }
                return false;
            });
        },
        excluded_account_id: function(m, key, arr)
        {
            return arr.every(function(k)
            {
                for (var key in m.pgroup)
                {
                    if (m.pgroup[key].account_id === k)
                    {
                        return false;
                    }
                }
                return true;
            });
        },
        with_hero_id: function(m, key, arr)
        {
            return arr.every(function(k)
            {
                for (var key in m.pgroup)
                {
                    if (m.pgroup[key].hero_id === k && isRadiant(m.pgroup[key]) === isRadiant(m))
                    {
                        return true;
                    }
                }
                return false;
            });
        },
        against_hero_id: function(m, key, arr)
        {
            return arr.every(function(k)
            {
                for (var key in m.pgroup)
                {
                    if (m.pgroup[key].hero_id === k && isRadiant(m.pgroup[key]) !== isRadiant(m))
                    {
                        return true;
                    }
                }
                return false;
            });
        }
    };
    var curtime = Math.floor(Date.now() / 1000);
    var filtered = [];
    for (var i = 0; i < matches.length; i++)
    {
        var include = true;
        //verify the match passes each filter test
        for (var key in filters)
        {
            if (conditions[key])
            {
                //earlier, we arrayified everything
                //pass the first element, as well as the full array
                //check that it passes all filters
                //pass the player_match, the first element of array, and the array itself
                include = include && conditions[key](matches[i], filters[key][0], filters[key]);
            }
        }
        //if we passed, push it
        if (include)
        {
            filtered.push(matches[i]);
        }
    }
    return filtered;
};
