function getSkillLevel(meta, ability, time) {
  const upgrades = meta.abilities.filter(au => au.ability === ability && au.time < time);
  const lastUpgrade = upgrades.reduce((x, y) => (x.time > y.time ? x : y));
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

module.exports = performanceOthers;
