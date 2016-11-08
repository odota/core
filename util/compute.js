const constants = require('dotaconstants');
const utility = require('./utility');
const laneMappings = require('./laneMappings');
const mode = utility.mode;
const max = utility.max;
const min = utility.min;
const isRadiant = utility.isRadiant;
const ancients = constants.ancients;
/**
 * Computes additional properties from a match/player_match
 **/
function computeMatchData(pm) {
  const self_hero = constants.heroes[pm.hero_id];
  // Compute patch based on start_time
  if (pm.start_time) {
    pm.patch = utility.getPatchIndex(pm.start_time);
  }
  if (pm.cluster) {
    pm.region = constants.cluster[pm.cluster];
  }
  if (pm.player_slot !== undefined && pm.radiant_win !== undefined) {
    pm.isRadiant = isRadiant(pm);
    pm.win = Number(isRadiant(pm) === pm.radiant_win);
    pm.lose = Number(isRadiant(pm) === pm.radiant_win) ? 0 : 1;
  }
  if (pm.duration && pm.gold_per_min) {
    pm.total_gold = ~~(pm.gold_per_min * pm.duration / 60);
  }
  if (pm.duration && pm.xp_per_min) {
    pm.total_xp = ~~(pm.xp_per_min * pm.duration / 60);
  }
  if (pm.duration && pm.kills) {
    pm.kills_per_min = pm.kills / (pm.duration / 60);
  }
  if (pm.kills !== undefined && pm.deaths !== undefined && pm.assists !== undefined) {
    pm.kda = ~~((pm.kills + pm.assists) / (pm.deaths + 1));
  }
  if (pm.leaver_status !== undefined) {
    pm.abandons = Number(pm.leaver_status >= 2);
  }
  if (pm.pgroup) {
    pm.heroes = pm.pgroup;
  }
  if (pm.chat) {
    // word counts for this player and all players
    // aggregation of all words in all chat this player has experienced
    pm.all_word_counts = count_words(pm, null);
    // aggregation of only the words in all chat this player said themselves
    pm.my_word_counts = count_words(pm, pm);
  }
  if (pm.kills_log && self_hero) {
    // remove self kills
    pm.kills_log = pm.kills_log.filter(k =>
      k.key !== self_hero.name
    );
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
    for (var key in pm.killed) {
      if (key.indexOf('creep_goodguys') !== -1 || key.indexOf('creep_badguys') !== -1) {
        pm.lane_kills += pm.killed[key];
      }
      if (key.indexOf('observer') !== -1) {
        pm.observer_kills += pm.killed[key];
      }
      if (key.indexOf('sentry') !== -1) {
        pm.sentry_kills += pm.killed[key];
      }
      if (key.indexOf('npc_dota_hero') === 0) {
        if (!self_hero || self_hero.name !== key) {
          pm.hero_kills += pm.killed[key];
        }
      }
      if (key.indexOf('npc_dota_neutral') === 0) {
        pm.neutral_kills += pm.killed[key];
      }
      if ((key in ancients)) {
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
    }
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
    const tenMinute = (40 * 60 + 45 * 20 + 74 * 2) + (600 / 0.6) + 625;
    pm.lane_efficiency = pm.gold_t[10] / tenMinute;
    pm.lane_efficiency_pct = ~~(pm.lane_efficiency * 100);
  }
  if (pm.lane_pos) {
    // compute lanes
    const lanes = [];
    // iterate over the position hash and get the lane bucket for each data point
    Object.keys(pm.lane_pos).forEach((x) => {
      Object.keys(pm.lane_pos[x]).forEach((y) => {
        const val = pm.lane_pos[x][y];
        // Add it N times to the array
        for (let i = 0; i < val; i += 1) {
          lanes.push(laneMappings[y][x]);
        }
      });
    });
    if (lanes.length) {
      pm.lane = mode(lanes);
      const radiant = pm.isRadiant;
      const lane_roles = {
        1() {
          // bot
          return radiant ? 1 : 3;
        },
        2() {
          // mid
          return 2;
        },
        3() {
          // top
          return radiant ? 3 : 1;
        },
        4() {
          // rjung
          return 4;
        },
        5() {
          // djung
          return 4;
        },
      };
      pm.lane_role = lane_roles[pm.lane] ? lane_roles[pm.lane]() : undefined;
    }
  }
  // compute hashes of purchase time sums and counts from logs
  if (pm.purchase_log) {
    // remove ward dispenser and recipes
    pm.purchase_log = pm.purchase_log.filter(purchase =>
      !(purchase.key.indexOf('recipe_') === 0 || purchase.key === 'ward_dispenser')
    );
    pm.purchase_time = {};
    pm.first_purchase_time = {};
    pm.item_win = {};
    pm.item_usage = {};
    for (var i = 0; i < pm.purchase_log.length; i++) {
      const k = pm.purchase_log[i].key;
      const time = pm.purchase_log[i].time;
      if (!pm.purchase_time[k]) {
        pm.purchase_time[k] = 0;
      }
      // Store first purchase time for every item
      if (!pm.first_purchase_time.hasOwnProperty(k)) {
        pm.first_purchase_time[k] = time;
      }
      pm.purchase_time[k] += time;
      pm.item_usage[k] = 1;
      pm.item_win[k] = isRadiant(pm) === pm.radiant_win ? 1 : 0;
    }
  }
  if (pm.purchase) {
    // account for stacks
    pm.purchase.ward_sentry *= 2;
    pm.purchase.dust *= 2;
    pm.purchase_ward_observer = pm.purchase.ward_observer;
    pm.purchase_ward_sentry = pm.purchase.ward_sentry;
    pm.purchase_tpscroll = pm.purchase.tpscroll;
    pm.purchase_rapier = pm.purchase.rapier;
    pm.purchase_gem = pm.purchase.gem;
  }
  if (pm.actions && pm.duration) {
    let actions_sum = 0;
    for (var key in pm.actions) {
      actions_sum += pm.actions[key];
    }
    pm.actions_per_min = ~~(actions_sum / pm.duration * 60);
  }
  // compute throw/comeback levels
  if (pm.radiant_gold_adv && pm.radiant_win !== undefined) {
    const radiant_gold_advantage = pm.radiant_gold_adv;
    pm.throw = pm.radiant_win !== isRadiant(pm) ? (isRadiant(pm) ? max(radiant_gold_advantage) : min(radiant_gold_advantage) * -1) : undefined;
    pm.comeback = pm.radiant_win === isRadiant(pm) ? (isRadiant(pm) ? min(radiant_gold_advantage) * -1 : max(radiant_gold_advantage)) : undefined;
    pm.loss = pm.radiant_win !== isRadiant(pm) ? (isRadiant(pm) ? min(radiant_gold_advantage) * -1 : max(radiant_gold_advantage)) : undefined;
    pm.stomp = pm.radiant_win === isRadiant(pm) ? (isRadiant(pm) ? max(radiant_gold_advantage) : min(radiant_gold_advantage) * -1) : undefined;
  }
  if (pm.pings) {
    pm.pings = pm.pings[0];
  }
  if (pm.life_state) {
    pm.life_state_dead = (pm.life_state[1] || 0) + (pm.life_state[2] || 0);
  }
}

/**
 * Count the words that occur in a set of messages
 * - messages: the messages to create the counts over
 * - player_filter: if non-null, only count that player's messages
 **/
function count_words(player_match, player_filter) {
  const messages = player_match.chat;
  // extract the message strings from the message objects
  // extract individual words from the message strings
  let chat_words = [];
  messages.forEach((message) => {
    // if there is no player_filter, or if the passed player's player_slot matches this message's parseSlot converted to player_slot, log it
    const messageParseSlot = message.slot < 5 ? message.slot : message.slot + (128 - 5);
    if (!player_filter || (messageParseSlot === player_filter.player_slot)) {
      chat_words.push(message.key);
    }
  });
  chat_words = chat_words.join(' ');
  const tokens = utility.tokenize(chat_words);
  // count how frequently each word occurs
  const counts = {};
  for (let i = 0; i < tokens.length; i++) {
    // ignore the empty string
    if (tokens[i]) {
      if (!counts[tokens[i]]) {
        counts[tokens[i]] = 0;
      }
      counts[tokens[i]] += 1;
    }
  }
  // return the final counts
  return counts;
}
module.exports = {
  computeMatchData,
  count_words,
};
