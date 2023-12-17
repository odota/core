import { getPatchIndex, isRadiant, isSignificant } from './utility';
import constants from 'dotaconstants';

export type FilterType = keyof typeof filterDeps;
/**
 * Object listing dependent columns for each filter
 * */
export const filterDeps = {
  win: ['player_slot', 'radiant_win'],
  patch: ['start_time'],
  leaver_status: ['leaver_status'],
  game_mode: ['game_mode'],
  lobby_type: ['lobby_type'],
  region: ['cluster'],
  date: ['start_time'],
  lane_role: ['lane_role'],
  hero_id: ['hero_id'],
  is_radiant: ['player_slot'],
  party_size: ['party_size'],
  included_account_id: ['heroes'],
  excluded_account_id: ['heroes'],
  with_account_id: ['player_slot', 'heroes'],
  against_account_id: ['player_slot', 'heroes'],
  with_hero_id: ['player_slot', 'heroes'],
  against_hero_id: ['player_slot', 'heroes'],
  significant: ['duration', 'game_mode', 'lobby_type', 'radiant_win'],
  leagueid: ['leagueid'],
} as const;

const filterFuncs: {
  [key in FilterType]: (
    m: ParsedPlayerMatch,
    key: number,
    arr: number[],
    curtime: number,
  ) => boolean;
} = {
  // filter: player won
  win(m, key) {
    return Number(isRadiant(m) === m.radiant_win) === key;
  },
  patch(m, key) {
    return getPatchIndex(m.start_time) === key;
  },
  game_mode(m, key) {
    return m.game_mode === key;
  },
  lobby_type(m, key) {
    return m.lobby_type === key;
  },
  region(m, key) {
    return constants.cluster[m.cluster] === key;
  },
  date(m, key, _arr, curtime) {
    return m.start_time > curtime - key * 86400;
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
        if (
          m.heroes[key].account_id === k &&
          isRadiant({ player_slot: Number(key) }) === isRadiant(m)
        ) {
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
        if (
          m.heroes[key].account_id === k &&
          isRadiant({ player_slot: Number(key) }) !== isRadiant(m)
        ) {
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
        if (
          m.heroes[key].hero_id === k &&
          isRadiant({ player_slot: Number(key) }) === isRadiant(m)
        ) {
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
        if (
          m.heroes[key].hero_id === k &&
          isRadiant({ player_slot: Number(key) }) !== isRadiant(m)
        ) {
          passed = true;
        }
      });
      return passed;
    });
  },
  significant(m, key) {
    return Number(isSignificant(m)) === key;
  },
  leagueid(m, key) {
    return m.leagueid === key;
  },
  leaver_status(m, key) {
    return m.leaver_status === key;
  },
};

export function filterMatches(
  matches: ParsedPlayerMatch[],
  filters?: ArrayifiedFilters
) {
  // Used for date filter
  const curtime = Math.floor(Date.now() / 1000);
  // accept a hash of filters, run all the filters in the hash in series
  const filtered = [];
  for (let i = 0; i < matches.length; i += 1) {
    let include = true;
    // verify the match passes each filter test
    Object.keys(filters || {}).forEach((key) => {
      if (filterFuncs[key as FilterType] && filters && filters[key] && filters[key]?.length) {
        // earlier, we arrayified everything
        // pass the first element, as well as the full array
        // check that it passes all filters
        // pass the player_match, the first element of array, and the array itself
        include =
          include && filterFuncs[key as FilterType](matches[i], filters[key][0], filters[key], curtime);
      }
    });
    // if we passed, push it
    if (include) {
      filtered.push(matches[i]);
    }
  }
  return filtered;
}
