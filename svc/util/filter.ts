import { getPatchIndex, isSignificant } from "./compute.ts";
import { cluster } from "dotaconstants";
import { isRadiant } from "./utility.ts";

type FilterType = keyof typeof filterDeps;
/**
 * Object listing dependent columns for each filter
 * */
export const filterDeps = {
  win: ["player_slot", "radiant_win"],
  patch: ["start_time"],
  leaver_status: ["leaver_status"],
  game_mode: ["game_mode"],
  lobby_type: ["lobby_type"],
  region: ["cluster"],
  date: ["start_time"],
  lane_role: ["lane_role"],
  hero_id: ["hero_id"],
  is_radiant: ["player_slot"],
  party_size: ["party_size"],
  included_account_id: ["heroes"],
  excluded_account_id: ["heroes"],
  with_account_id: ["player_slot", "heroes"],
  against_account_id: ["player_slot", "heroes"],
  with_hero_id: ["player_slot", "heroes"],
  against_hero_id: ["player_slot", "heroes"],
  significant: ["duration", "game_mode", "lobby_type", "radiant_win"],
  leagueid: ["leagueid"],
} as const;

const filterFuncs: {
  [key in FilterType]: (
    m: ParsedPlayerMatch,
    val: string | number,
    arr: (string | number)[],
    curtime: number,
  ) => boolean;
} = {
  // filter: player won
  win(m, val) {
    return Number(isRadiant(m) === m.radiant_win) === val;
  },
  patch(m, val) {
    return getPatchIndex(m.start_time) === val;
  },
  game_mode(m, val) {
    return m.game_mode === val;
  },
  lobby_type(m, val) {
    return m.lobby_type === val;
  },
  region(m, val) {
    return cluster[String(m.cluster) as keyof typeof cluster] === val;
  },
  date(m, val, _arr, curtime) {
    return m.start_time > curtime - Number(val) * 86400;
  },
  lane_role(m, val) {
    return m.lane_role === val;
  },
  hero_id(m, val) {
    return m.hero_id === val;
  },
  is_radiant(m, val) {
    return Number(isRadiant(m)) === val;
  },
  party_size(m, val) {
    return m.party_size === val;
  },
  included_account_id(m, val, arr) {
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
  excluded_account_id(m, val, arr) {
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
  with_account_id(m, val, arr) {
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
  against_account_id(m, val, arr) {
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
  with_hero_id(m, val, arr) {
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
  against_hero_id(m, val, arr) {
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
  significant(m, val) {
    return Number(isSignificant(m)) === val;
  },
  leagueid(m, val) {
    return m.leagueid === val;
  },
  leaver_status(m, val) {
    return m.leaver_status === val;
  },
};

export function filterMatches(
  matches: ParsedPlayerMatch[],
  filters?: Map<string, (string | number)[]>,
) {
  // Used for date filter
  const curtime = Math.floor(Date.now() / 1000);
  // accept a hash of filters, run all the filters in the hash in series
  const filtered = [];
  for (let match of matches) {
    let include = true;
    if (filters) {
      // verify the match passes each filter test
      Array.from(filters.keys()).forEach((key) => {
        const arr = filters.get(key);
        const first = arr?.[0];
        if (filterFuncs[key as FilterType] && first !== undefined && arr) {
          // earlier, we arrayified everything
          // pass the first element, as well as the full array
          // check that it passes all filters
          // pass the player_match, the first element of array, and the array itself
          include =
            include &&
            filterFuncs[key as FilterType](match, first, arr, curtime);
        }
      });
    }
    // if we passed, push it
    if (include) {
      filtered.push(match);
    }
  }
  return filtered;
}
