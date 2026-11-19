import { getPatchIndex, isSignificant } from "./compute.ts";
import { cluster, game_mode, lobby_type, patch } from "dotaconstants";
import { isRadiant } from "./utility.ts";

type FilterType = keyof typeof filterDeps;

const balancedGameModes = Object.entries(game_mode)
  .filter(([, v]) => (v as any).balanced)
  .map(([k]) => Number(k));

const balancedLobbyTypes = Object.entries(lobby_type)
  .filter(([, v]) => (v as any).balanced)
  .map(([k]) => Number(k));

const patchTimestamps = patch.map((p) =>
  Math.floor(new Date(p.date).getTime() / 1000),
);

export function getPatchSqlExpr(col = "start_time"): string {
  const parts: string[] = [];
  for (let i = patchTimestamps.length - 1; i >= 1; i--) {
    parts.push(`${col} >= ${patchTimestamps[i]}, ${i}`);
  }
  return `multiIf(${parts.join(", ")}, 0)`;
}

export function getRegionSqlExpr(col = "cluster"): string {
  const entries = Object.entries(cluster)
    .map(([k, v]) => `${col} = ${Number(k)}, ${Number(v)}`)
    .join(", ");
  return `multiIf(${entries}, 0)`;
}

export function buildFilterConditions(
  filters?: Map<string, (string | number)[]>,
): string[] {
  const conditions: string[] = [];
  if (!filters) {
    return conditions;
  }
  const curtime = Math.floor(Date.now() / 1000);
  const winExpr = "((ifNull(player_slot, 0) < 128) = ifNull(radiant_win, false))";
  const isRadiantExpr = "(ifNull(player_slot, 0) < 128)";
  const heroesKv = "JSONExtractKeysAndValuesRaw(ifNull(heroes, '{}'))";

  for (const [key, arr] of filters.entries()) {
    const first = arr?.[0];
    if (first === undefined || !arr || !arr.length) {
      continue;
    }
    const numVal = Number(first);
    switch (key as FilterType) {
      case "win":
        conditions.push(`toUInt8(${winExpr}) = ${numVal}`);
        break;
      case "is_radiant":
        conditions.push(`toUInt8(${isRadiantExpr}) = ${numVal}`);
        break;
      case "patch": {
        const idx = numVal;
        if (idx >= 0 && idx < patchTimestamps.length) {
          const minTs = patchTimestamps[idx];
          const maxTs = patchTimestamps[idx + 1];
          if (maxTs !== undefined) {
            conditions.push(`(start_time >= ${minTs} AND start_time < ${maxTs})`);
          } else {
            conditions.push(`(start_time >= ${minTs})`);
          }
        } else {
          conditions.push("0");
        }
        break;
      }
      case "game_mode":
        conditions.push(`game_mode = ${numVal}`);
        break;
      case "lobby_type":
        conditions.push(`lobby_type = ${numVal}`);
        break;
      case "region": {
        const clusters = Object.entries(cluster)
          .filter(([, reg]) => Number(reg) === numVal)
          .map(([c]) => Number(c));
        if (clusters.length) {
          conditions.push(`cluster IN (${clusters.join(",")})`);
        } else {
          conditions.push("0");
        }
        break;
      }
      case "date":
        conditions.push(`start_time > ${curtime - numVal * 86400}`);
        break;
      case "lane_role":
        conditions.push(`lane_role = ${numVal}`);
        break;
      case "hero_id":
        conditions.push(`hero_id = ${numVal}`);
        break;
      case "party_size":
        conditions.push(`party_size = ${numVal}`);
        break;
      case "leaver_status":
        conditions.push(`leaver_status = ${numVal}`);
        break;
      case "significant": {
        const sigExpr = `(game_mode IN (${balancedGameModes.join(",")}) AND lobby_type IN (${balancedLobbyTypes.join(",")}) AND isNotNull(radiant_win) AND duration > 360)`;
        conditions.push(`toUInt8(${sigExpr}) = ${numVal}`);
        break;
      }
      case "included_account_id":
        for (const k of arr) {
          const id = Number(k);
          conditions.push(
            `arrayExists(x -> JSONExtractInt(x.2, 'account_id') = ${id}, ${heroesKv})`,
          );
        }
        break;
      case "excluded_account_id":
        for (const k of arr) {
          const id = Number(k);
          conditions.push(
            `NOT arrayExists(x -> JSONExtractInt(x.2, 'account_id') = ${id}, ${heroesKv})`,
          );
        }
        break;
      case "with_account_id":
        for (const k of arr) {
          const id = Number(k);
          conditions.push(
            `arrayExists(x -> JSONExtractInt(x.2, 'account_id') = ${id} AND ((toInt32OrZero(x.1) < 128) = ${isRadiantExpr}), ${heroesKv})`,
          );
        }
        break;
      case "against_account_id":
        for (const k of arr) {
          const id = Number(k);
          conditions.push(
            `arrayExists(x -> JSONExtractInt(x.2, 'account_id') = ${id} AND ((toInt32OrZero(x.1) < 128) != ${isRadiantExpr}), ${heroesKv})`,
          );
        }
        break;
      case "with_hero_id":
        for (const k of arr) {
          const id = Number(k);
          conditions.push(
            `arrayExists(x -> JSONExtractInt(x.2, 'hero_id') = ${id} AND ((toInt32OrZero(x.1) < 128) = ${isRadiantExpr}), ${heroesKv})`,
          );
        }
        break;
      case "against_hero_id":
        for (const k of arr) {
          const id = Number(k);
          conditions.push(
            `arrayExists(x -> JSONExtractInt(x.2, 'hero_id') = ${id} AND ((toInt32OrZero(x.1) < 128) != ${isRadiantExpr}), ${heroesKv})`,
          );
        }
        break;
      case "leagueid":
        // leagueid is not stored in player_caches
        conditions.push("0");
        break;
    }
  }
  return conditions;
}
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
