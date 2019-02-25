const utility = require('./utility');

const { isRadiant } = utility;

function filter(matches, filters) {
  const curtime = Math.floor(Date.now() / 1000);
  // accept a hash of filters, run all the filters in the hash in series
  // console.log(filters);
  const conditions = {
    // filter: player won
    win(m, key) {
      return Number(isRadiant(m) === m.radiant_win) === key;
    },
    patch(m, key) {
      return m.patch === key;
    },
    game_mode(m, key) {
      return m.game_mode === key;
    },
    lobby_type(m, key) {
      return m.lobby_type === key;
    },
    region(m, key) {
      return m.region === key;
    },
    date(m, key) {
      return m.start_time > (curtime - (key * 86400));
    },
    lane_role(m, key) {
      return m.lane_role === key;
    },
    hero_id(m, key) {
      return m.hero_id === key;
    },
    is_radiant(m, key) {
      return Number(isRadiant(m)) === key;
    },
    party_size(m, key) {
      return m.party_size === key;
    },
    included_account_id(m, key, arr) {
      return arr.every((k) => {
        let passed = false;
        Object.keys(m.heroes || {}).forEach((key) => {
          if (m.heroes[key].account_id === k) {
            passed = true;
          }
        });
        return passed;
      });
    },
    excluded_account_id(m, key, arr) {
      return arr.every((k) => {
        let passed = true;
        Object.keys(m.heroes || {}).forEach((key) => {
          if (m.heroes[key].account_id === k) {
            passed = false;
          }
        });
        return passed;
      });
    },
    with_account_id(m, key, arr) {
      return arr.every((k) => {
        let passed = false;
        Object.keys(m.heroes || {}).forEach((key) => {
          if (m.heroes[key].account_id === k && isRadiant(m.heroes[key]) === isRadiant(m)) {
            passed = true;
          }
        });
        return passed;
      });
    },
    against_account_id(m, key, arr) {
      return arr.every((k) => {
        let passed = false;
        Object.keys(m.heroes || {}).forEach((key) => {
          if (m.heroes[key].account_id === k && isRadiant(m.heroes[key]) !== isRadiant(m)) {
            passed = true;
          }
        });
        return passed;
      });
    },
    with_hero_id(m, key, arr) {
      return arr.every((k) => {
        let passed = false;
        Object.keys(m.heroes || {}).forEach((key) => {
          if (m.heroes[key].hero_id === k && isRadiant(m.heroes[key]) === isRadiant(m)) {
            passed = true;
          }
        });
        return passed;
      });
    },
    against_hero_id(m, key, arr) {
      return arr.every((k) => {
        let passed = false;
        Object.keys(m.heroes || {}).forEach((key) => {
          if (m.heroes[key].hero_id === k && isRadiant(m.heroes[key]) !== isRadiant(m)) {
            passed = true;
          }
        });
        return passed;
      });
    },
    significant(m, key) {
      return Number(utility.isSignificant(m)) === key;
    },
    leagueid(m, key) {
      return m.leagueid === key;
    },
  };
  const filtered = [];
  for (let i = 0; i < matches.length; i += 1) {
    let include = true;
    // verify the match passes each filter test
    Object.keys(filters || {}).forEach((key) => {
      if (conditions[key]) {
        // earlier, we arrayified everything
        // pass the first element, as well as the full array
        // check that it passes all filters
        // pass the player_match, the first element of array, and the array itself
        include = include && conditions[key](matches[i], filters[key][0], filters[key]);
      }
    });
    // if we passed, push it
    if (include) {
      filtered.push(matches[i]);
    }
  }
  return filtered;
}
module.exports = filter;
