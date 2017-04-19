function getSkillLevel(meta, ability, time) {
  const upgrades = meta.abilities.filter(au => au.ability === ability && au.time < time);
  const lastUpgrade = upgrades.reduce((x, y) => x.time > y.time ? x : y);
  return lastUpgrade;
}

function greevilsGreed(e, container, meta) {
  if (e.type === 'killed' && 'greevils_greed_stack' in e) {
    const alchName = 'npc_dota_hero_alchemist';
    const alchSlot = meta.hero_to_slot[alchName];
    const alchPlayer = container.players[alchSlot];

    const greevilsGreedId = 5368;
    const ggLvl = getSkillLevel(meta, greevilsGreedId, e.time);

    const goldBase = 6;
    let goldStack = e.greevils_greed_stack * 3;

    switch (ggLvl.level) {
      case 1: goldStack = Math.min(goldStack, 12); break;
      case 2: goldStack = Math.min(goldStack, 20); break;
      case 3: goldStack = Math.min(goldStack, 28); break;
      case 4: goldStack = Math.min(goldStack, 36); break;
      default: return;
    }

    alchPlayer.performance_others = Object.assign({}, {
      greevils_greed_gold: 0,
    }, alchPlayer.performance_others);

    alchPlayer.performance_others.greevils_greed_gold += goldBase + goldStack;
  }
}

function track(e, container, meta) {
  if (e.tracked_death) {
    const trackerSlot = meta.hero_to_slot[e.tracked_sourcename];
    const trackerPlayer = container.players[trackerSlot];

    const trackerId = 5288;
    const trackLvl = getSkillLevel(meta, trackerId, e.time);

    let gold = 0;
    switch (trackLvl.level) {
      case 1: gold = 150; break;
      case 2: gold = 250; break;
      case 3: gold = 350; break;
      default: return;
    }

    trackerPlayer.performance_others = Object.assign({}, {
      tracked_deaths: 0,
      track_gold: 0,
    }, trackerPlayer.performance_others);

    trackerPlayer.performance_others.tracked_deaths += 1;
    trackerPlayer.performance_others.track_gold += gold;
  }
}

function performanceOthers(e, container, meta) {
  if (!meta) {
    return;
  }

  greevilsGreed(e, container, meta);
  track(e, container, meta);
}

function populate(e, container, meta) {
  let t;
  switch (e.type) {
    case 'interval':
      break;
    case 'player_slot':
      container.players[e.key].player_slot = e.value;
      break;
    case 'chat':
      container.chat.push(JSON.parse(JSON.stringify(e)));
      break;
    case 'cosmetics':
      container.cosmetics = JSON.parse(e.key);
      break;
    case 'CHAT_MESSAGE_TOWER_KILL':
    case 'CHAT_MESSAGE_TOWER_DENY':
    case 'CHAT_MESSAGE_BARRACKS_KILL':
    case 'CHAT_MESSAGE_FIRSTBLOOD':
    case 'CHAT_MESSAGE_AEGIS':
    case 'CHAT_MESSAGE_AEGIS_STOLEN':
    case 'CHAT_MESSAGE_DENIED_AEGIS':
    case 'CHAT_MESSAGE_ROSHAN_KILL':
      container.objectives.push(JSON.parse(JSON.stringify(e)));
      break;
    default:
      if (!container.players[e.slot]) {
      // couldn't associate with a player, probably attributed to a creep/tower/necro unit
      // console.log(e);
        return;
      }
      t = container.players[e.slot][e.type];
      if (typeof t === 'undefined') {
      // container.players[0] doesn't have a type for this event
      // console.log("no field in parsed_data.players for %s", e.type);
        return;
      } else if (e.posData) {
      // fill 2d hash with x,y values
        const key = JSON.parse(e.key);
        const x = key[0];
        const y = key[1];
        if (!t[x]) {
          t[x] = {};
        }
        if (!t[x][y]) {
          t[x][y] = 0;
        }
        t[x][y] += 1;
      } else if (e.max) {
      // check if value is greater than what was stored in value prop
        if (e.value > t.value) {
          container.players[e.slot][e.type] = e;
        }
      } else if (t.constructor === Array) {
      // determine whether we want the value only (interval) or everything (log)
      // either way this creates a new value so e can be mutated later
        let arrEntry;
        if (e.interval) {
          arrEntry = e.value;
        } else if (e.type === 'purchase_log' || e.type === 'kills_log' || e.type === 'runes_log') {
          arrEntry = {
            time: e.time,
            key: e.key,
            tracked_death: e.tracked_death,
            tracked_sourcename: e.tracked_sourcename,
          };
        } else {
          arrEntry = JSON.parse(JSON.stringify(e));
        }
        t.push(arrEntry);
      } else if (typeof t === 'object') {
      // add it to hash of counts
        e.value = e.value || 1;
        if (t[e.key]) {
          t[e.key] += e.value;
        } else {
          t[e.key] = e.value;
        }

        performanceOthers(e, container, meta);
      } else if (typeof t === 'string') {
      // string, used for steam id
        container.players[e.slot][e.type] = e.key;
      } else {
      // we must use the full reference since this is a primitive type
        container.players[e.slot][e.type] = e.value;
      }
      break;
  }
}
module.exports = populate;

