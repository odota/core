function getSkillLevel(meta, ability, time) {
  return meta.abilities.filter(au => au.ability === ability && au.time < time).reduce((x,y) => x.time > y.time ? x : y); 
}

function greevilsGreed(e, container, meta) {
  if (e.type === 'killed' && 'greevils_greed_stack' in e) {
    let alch_slot = meta.hero_to_slot['npc_dota_hero_alchemist'];
    let alch_player = container.players[alch_slot];
    
    let greevils_greed_id = 5368;
    let gg_lvl = getSkillLevel(meta, greevils_greed_id, e.time);
    
    let gold_base = 6;
    let gold_stack = e.greevils_greed_stack * 3;
    
    switch(gg_lvl.level) {
      case 1: gold_stack = Math.min(gold_stack, 12); break;
      case 2: gold_stack = Math.min(gold_stack, 20); break;
      case 3: gold_stack = Math.min(gold_stack, 28); break;
      case 4: gold_stack = Math.min(gold_stack, 36); break;
    }

    alch_player.performance_others = Object.assign({}, { greevils_greed_gold: 0 }, alch_player.performance_others)
    alch_player.performance_others.greevils_greed_gold += gold_base + gold_stack;
  }
}

function track(e, container, meta) {
  if (e.tracked_death) {
    let tracker_slot = meta.hero_to_slot[e.tracked_sourcename];
    let tracker_player = container.players[tracker_slot];

    let track_id = 5288
    let track_lvl = meta.abilities.filter(au => au.ability === track_id  && au.time < e.time).reduce((x,y) => x.time > y.time ? x : y);
    
    let gold = 0;
    switch(track_lvl.level) {
      case 1: gold = 150; break;
      case 2: gold = 250; break;
      case 3: gold = 350; break;
    }

    tracker_player.performance_others = Object.assign({}, { tracked_deaths: 0, track_gold: 0 }, tracker_player.performance_others)
    tracker_player.performance_others.tracked_deaths += 1;
    tracker_player.performance_others.track_gold += gold;
  }
}

function performanceOthers(e, container, meta) {
  if (!meta)
    return;

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

