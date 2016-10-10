const utility = require('./utility');
const isRadiant = utility.isRadiant;

function filter(matches, filters)
{
    // accept a hash of filters, run all the filters in the hash in series
    // console.log(filters);
  const conditions = {
        // filter: player won
    win(m, key)
        {
      return Number(utility.isRadiant(m) === m.radiant_win) === key;
    },
    patch(m, key)
        {
      return m.patch === key;
    },
    game_mode(m, key)
        {
      return m.game_mode === key;
    },
    lobby_type(m, key)
        {
      return m.lobby_type === key;
    },
    region(m, key)
        {
      return m.region === key;
    },
    date(m, key)
        {
      return m.start_time > (curtime - (key * 86400));
    },
    lane_role(m, key)
        {
      return m.lane_role === key;
    },
    hero_id(m, key)
        {
      return m.hero_id === key;
    },
    is_radiant(m, key)
        {
      return Number(utility.isRadiant(m)) === key;
    },
    included_account_id(m, key, arr)
        {
      return arr.every((k) => {
        for (const key in m.heroes)
                {
          if (m.heroes[key].account_id === k)
                    {
            return true;
          }
        }
        return false;
      });
    },
    excluded_account_id(m, key, arr)
        {
      return arr.every((k) => {
        for (const key in m.heroes)
                {
          if (m.heroes[key].account_id === k)
                    {
            return false;
          }
        }
        return true;
      });
    },
    with_hero_id(m, key, arr)
        {
      return arr.every((k) => {
        for (const key in m.heroes)
                {
          if (m.heroes[key].hero_id === k && isRadiant(m.heroes[key]) === isRadiant(m))
                    {
            return true;
          }
        }
        return false;
      });
    },
    against_hero_id(m, key, arr)
        {
      return arr.every((k) => {
        for (const key in m.heroes)
                {
          if (m.heroes[key].hero_id === k && isRadiant(m.heroes[key]) !== isRadiant(m))
                    {
            return true;
          }
        }
        return false;
      });
    },
    significant(m, key, arr)
        {
      return Number(utility.isSignificant(m)) === key;
    },
  };
  let curtime = Math.floor(Date.now() / 1000);
  const filtered = [];
  for (let i = 0; i < matches.length; i++)
    {
    let include = true;
        // verify the match passes each filter test
    for (const key in filters)
        {
      if (conditions[key])
            {
                // earlier, we arrayified everything
                // pass the first element, as well as the full array
                // check that it passes all filters
                // pass the player_match, the first element of array, and the array itself
        include = include && conditions[key](matches[i], filters[key][0], filters[key]);
      }
    }
        // if we passed, push it
    if (include)
        {
      filtered.push(matches[i]);
    }
  }
  return filtered;
}
module.exports = filter;
