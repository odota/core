import {
  heroes,
  cluster,
  ancients,
  game_mode,
  lobby_type,
  patch,
} from 'dotaconstants';
import {
  getAnonymousAccountId,
  isRadiant,
  max,
  min,
  modeWithCount,
  tokenize,
} from './utility.ts';
import laneMappings from './laneMappings.ts';

/**
 * Count the words that occur in a set of messages
 * - messages: the messages to create the counts over
 * - player_filter: if non-null, only count that player's messages
 * */
export function countWords(
  playerMatch: ParsedPlayerMatch,
  playerFilter: { player_slot: number } | null,
) {
  const messages = playerMatch.chat;
  // extract the message strings from the message objects
  // extract individual words from the message strings
  let chatWords: string[] = [];
  messages.forEach((message) => {
    // if there is no player_filter
    // if the passed player's player_slot matches this message's parseSlot converted to player_slot
    const messageParseSlot =
      message.slot < 5 ? message.slot : message.slot + (128 - 5);
    if (!playerFilter || messageParseSlot === playerFilter.player_slot) {
      chatWords.push(message.key);
    }
  });
  const chatWordsString = chatWords.join(' ');
  const tokens = tokenize(chatWordsString);
  // count how frequently each word occurs
  // Use a JS Map since it's user input and a string like 'constructor' is going to cause problems
  const counts = new Map<string, number>();
  for (let token of tokens) {
    // ignore the empty string
    if (token) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }
  // return the final counts
  return Object.fromEntries(counts.entries());
}

/**
 * Computes additional properties from a match/player_match
 * */
export function computeMatchData(pm: ParsedPlayerMatch) {
  const selfHero = heroes[String(pm.hero_id) as keyof typeof heroes];
  // Compute patch based on start_time
  if (pm.start_time) {
    pm.patch = getPatchIndex(pm.start_time);
  }
  if (pm.cluster) {
    pm.region = cluster[String(pm.cluster) as keyof typeof cluster];
  }
  if (pm.player_slot !== undefined && pm.radiant_win !== undefined) {
    pm.isRadiant = isRadiant(pm);
    pm.win = Number(isRadiant(pm) === pm.radiant_win);
    pm.lose = Number(isRadiant(pm) === pm.radiant_win) ? 0 : 1;
  }
  if (pm.duration && pm.gold_per_min) {
    pm.total_gold = Math.floor((pm.gold_per_min * pm.duration) / 60);
  }
  if (pm.duration && pm.xp_per_min) {
    pm.total_xp = Math.floor((pm.xp_per_min * pm.duration) / 60);
  }
  if (pm.duration && pm.kills) {
    pm.kills_per_min = pm.kills / (pm.duration / 60);
  }
  if (
    pm.kills !== undefined &&
    pm.deaths !== undefined &&
    pm.assists !== undefined
  ) {
    pm.kda = Number(((pm.kills + pm.assists) / (pm.deaths + 1)).toFixed(2));
  }
  if (pm.leaver_status !== undefined) {
    pm.abandons = Number(pm.leaver_status >= 2);
  }
  if (pm.chat) {
    // word counts for this player and all players
    // aggregation of all words in all chat this player has experienced
    pm.all_word_counts = countWords(pm, null);
    // aggregation of only the words in all chat this player said themselves
    pm.my_word_counts = countWords(pm, pm);
  }
  if (pm.kills_log && selfHero) {
    // remove self kills
    pm.kills_log = pm.kills_log.filter((k) => k.key !== selfHero.name);
  }
  if (pm.killed) {
    pm.neutral_kills = 0;
    pm.tower_kills = 0;
    pm.courier_kills = 0;
    pm.lane_kills = 0;
    pm.hero_kills = 0;
    pm.observer_kills = 0;
    pm.sentry_kills = 0;
    pm.roshan_kills = 0;
    pm.necronomicon_kills = 0;
    pm.ancient_kills = 0;
    Object.keys(pm.killed).forEach((key) => {
      if (
        key.indexOf('creep_goodguys') !== -1 ||
        key.indexOf('creep_badguys') !== -1
      ) {
        pm.lane_kills += pm.killed[key];
      }
      if (key.indexOf('observer') !== -1) {
        pm.observer_kills += pm.killed[key];
      }
      if (key.indexOf('sentry') !== -1) {
        pm.sentry_kills += pm.killed[key];
      }
      if (key.indexOf('npc_dota_hero') === 0) {
        if (!selfHero || selfHero.name !== key) {
          pm.hero_kills += pm.killed[key];
        }
      }
      if (key.indexOf('npc_dota_neutral') === 0) {
        pm.neutral_kills += pm.killed[key];
      }
      if (key in ancients) {
        pm.ancient_kills += pm.killed[key];
      }
      if (key.indexOf('_tower') !== -1) {
        pm.tower_kills += pm.killed[key];
      }
      if (key.indexOf('courier') !== -1) {
        pm.courier_kills += pm.killed[key];
      }
      if (key.indexOf('roshan') !== -1) {
        pm.roshan_kills += pm.killed[key];
      }
      if (key.indexOf('necronomicon') !== -1) {
        pm.necronomicon_kills += pm.killed[key];
      }
    });
  }
  if (pm.buyback_log) {
    pm.buyback_count = pm.buyback_log.length;
  }
  if (pm.item_uses) {
    pm.observer_uses = pm.item_uses.ward_observer || 0;
    pm.sentry_uses = pm.item_uses.ward_sentry || 0;
  }
  if (pm.gold_t && pm.gold_t[10]) {
    // lane efficiency: divide 10 minute gold by static amount based on standard creep spawn
    // var tenMinute = (43 * 60 + 48 * 20 + 74 * 2);
    // 6.84 change
    const melee = 40 * 60;
    const ranged = 45 * 20;
    const siege = 74 * 2;
    const passive = 600 * 1.5;
    const starting = 600;
    const tenMinute = melee + ranged + siege + passive + starting;
    pm.lane_efficiency = pm.gold_t[10] / tenMinute;
    pm.lane_efficiency_pct = Math.floor(pm.lane_efficiency * 100);
  }
  if (pm.lane_pos) {
    const laneData = getLaneFromPosData(pm.lane_pos, isRadiant(pm));
    pm.lane = laneData.lane;
    pm.lane_role = laneData.lane_role;
    pm.is_roaming = laneData.is_roaming;
  }
  // compute hashes of purchase time sums and counts from logs
  if (pm.purchase_log) {
    // remove ward dispenser and recipes
    pm.purchase_log = pm.purchase_log.filter(
      (purchase) =>
        !(
          purchase.key.indexOf('recipe_') === 0 ||
          purchase.key === 'ward_dispenser'
        ),
    );
    pm.purchase_time = {};
    pm.first_purchase_time = {};
    pm.item_win = {};
    pm.item_usage = {};
    for (let i = 0; i < pm.purchase_log.length; i += 1) {
      const k = pm.purchase_log[i].key;
      const { time } = pm.purchase_log[i];
      if (!pm.purchase_time[k]) {
        pm.purchase_time[k] = 0;
      }
      // Store first purchase time for every item
      if (!pm.first_purchase_time[k]) {
        pm.first_purchase_time[k] = time;
      }
      pm.purchase_time[k] += time;
      pm.item_usage[k] = 1;
      pm.item_win[k] = isRadiant(pm) === pm.radiant_win ? 1 : 0;
    }
  }
  if (pm.purchase) {
    // account for stacks
    if (pm.patch && pm.patch < 42) {
      // In 7.23 dust changed to one per stack
      pm.purchase.dust *= 2;
    }
    pm.purchase_ward_observer = pm.purchase.ward_observer;
    pm.purchase_ward_sentry = pm.purchase.ward_sentry;
    pm.purchase_tpscroll = pm.purchase.tpscroll;
    pm.purchase_rapier = pm.purchase.rapier;
    pm.purchase_gem = pm.purchase.gem;
  }
  if (pm.actions && pm.duration) {
    let actionsSum = 0;
    Object.keys(pm.actions).forEach((key) => {
      actionsSum += pm.actions[key];
    });
    pm.actions_per_min = Math.floor((actionsSum / pm.duration) * 60);
  }
  // compute throw/comeback levels
  if (pm.radiant_gold_adv && pm.radiant_win !== undefined) {
    const radiantGoldAdvantage = pm.radiant_gold_adv;
    const throwVal = isRadiant(pm)
      ? max(radiantGoldAdvantage)
      : min(radiantGoldAdvantage) * -1;
    const comebackVal = isRadiant(pm)
      ? min(radiantGoldAdvantage) * -1
      : max(radiantGoldAdvantage);
    const lossVal = isRadiant(pm)
      ? min(radiantGoldAdvantage) * -1
      : max(radiantGoldAdvantage);
    const stompVal = isRadiant(pm)
      ? max(radiantGoldAdvantage)
      : min(radiantGoldAdvantage) * -1;
    pm.throw = pm.radiant_win !== isRadiant(pm) ? throwVal : undefined;
    pm.comeback = pm.radiant_win === isRadiant(pm) ? comebackVal : undefined;
    pm.loss = pm.radiant_win !== isRadiant(pm) ? lossVal : undefined;
    pm.stomp = pm.radiant_win === isRadiant(pm) ? stompVal : undefined;
  }
  if (pm.pings) {
    pm.pings = pm.pings['0'];
  }
  if (pm.life_state) {
    pm.life_state_dead = (pm.life_state[1] || 0) + (pm.life_state[2] || 0);
  }
}

/**
 * Determines if a match is significant for aggregation purposes
 * */
export function isSignificant(match: Match | ApiData) {
  return Boolean(
    game_mode[String(match.game_mode) as keyof typeof game_mode]?.balanced &&
    lobby_type[String(match.lobby_type) as keyof typeof lobby_type]?.balanced &&
    match.radiant_win != null &&
    match.duration > 360 &&
    (match.players || []).every(
      (player) => (player.gold_per_min || 0) <= 9999 && Boolean(player.hero_id),
    ),
  );
}

/**
 * Determines if a match is a pro match
 * */
export function isProMatch(match: ApiData) {
  return Boolean(
    isSignificant(match) &&
    match.leagueid &&
    match.human_players === 10 &&
    (match.game_mode === 0 ||
      match.game_mode === 1 ||
      match.game_mode === 2 ||
      // This is all pick but should only be for testing
      match.game_mode === 22) &&
    match.players &&
    match.players.every((player) => player.level > 1) &&
    match.players.every((player) => player.xp_per_min > 0) &&
    match.players.every((player) => player.hero_id > 0),
  );
}

/**
 * Gets the patch ID given a unix start time
 * */
export function getPatchIndex(startTime: number) {
  const date = new Date(startTime * 1000);
  let i;
  for (i = 1; i < patch.length; i += 1) {
    const pd = new Date(patch[i].date);
    // stop when patch date is past the start time
    if (pd > date) {
      break;
    }
  }
  // use the value of i before the break, started at 1 to avoid negative index
  return i - 1;
}

/**
 * Computes the lane a hero is in based on an input hash of positions
 * */
export function getLaneFromPosData(
  lanePos: Record<string, NumberDict>,
  isRadiant: boolean,
) {
  // compute lanes
  const lanes: number[] = [];
  // iterate over the position hash and get the lane bucket for each data point
  Object.keys(lanePos).forEach((x) => {
    Object.keys(lanePos[x]).forEach((y) => {
      const val = lanePos[x][y];
      const adjX = Number(x) - 64;
      const adjY = 128 - (Number(y) - 64);
      // Add it N times to the array
      for (let i = 0; i < val; i += 1) {
        if (laneMappings[adjY] && laneMappings[adjY][adjX]) {
          lanes.push(laneMappings[adjY][adjX]);
        }
      }
    });
  });
  const { mode: lane, count } = modeWithCount(lanes);
  /**
   * Player presence on lane. Calculated by the count of the prominant
   * lane (`count` of mode) divided by the presence on all lanes (`lanes.length`).
   * Having low presence (<45%) probably means the player is roaming.
   * */
  const isRoaming = (count ?? 0) / lanes.length < 0.45;
  // Roles, currently doesn't distinguish between carry/support in safelane
  // 1 safelane
  // 2 mid
  // 3 offlane
  // 4 jungle
  const laneRoles = {
    // bot
    1: isRadiant ? 1 : 3,
    // mid
    2: 2,
    // top
    3: isRadiant ? 3 : 1,
    // radiant jungle
    4: 4,
    // dire jungle
    5: 4,
  };
  return {
    lane,
    lane_role: laneRoles[lane as keyof typeof laneRoles],
    is_roaming: isRoaming,
  };
}

export function transformMatch(
  origMatch: Readonly<InsertMatchInput>,
): Readonly<InsertMatchInput> {
  return {
    ...origMatch,
    players: origMatch.players.map((p) => {
      const newP = { ...p } as Partial<ApiDataPlayer>;
      if (newP.account_id === getAnonymousAccountId()) {
        // don't insert anonymous account id
        delete newP.account_id;
      }
      if (newP.ability_upgrades) {
        // Reduce the ability upgrades info into ability_upgrades_arr (just an array of numbers)
        newP.ability_upgrades_arr = newP.ability_upgrades.map(
          (au: any) => au.ability,
        );
        delete newP.ability_upgrades;
      }
      delete newP.scaled_hero_damage;
      delete newP.scaled_tower_damage;
      delete newP.scaled_hero_healing;
      // We can keep scepter/shard/moonshard from API and then we're not as reliant on permanent_buffs from GC
      // delete p.aghanims_scepter;
      // delete p.aghanims_shard;
      // delete p.moonshard;
      return newP as any;
    }),
  };
}

export function createMatchCopy<T>(match: any): T {
  // Makes a deep copy of the original match
  const copy = JSON.parse(JSON.stringify(match));
  return copy;
}
