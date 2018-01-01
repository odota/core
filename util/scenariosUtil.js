const constants = require('dotaconstants');

// all items that cost 2000 or more
const items = Object.keys(constants.items).map(function (k) {
  if (constants.items[k].cost >= 2000) {
    return k
  }
})
const heroes = Object.keys(constants.heroes)
const timings = [5 * 60, 10 * 60, 15 * 60, 20 * 60, 25 * 60, 30 * 60]


function getCombinations(options, optionIndex, results, current) {
  var allKeys = Object.keys(options);
  var optionKey = allKeys[optionIndex];
  var vals = options[optionKey];
  for (var i = 0; i < vals.length; i++) {
    current[optionKey] = vals[i];
    if (optionIndex + 1 < allKeys.length) {
      getCombinations(options, optionIndex + 1, results, current);
    } else {
      var res = JSON.parse(JSON.stringify(current));
      results.push(res);
    }
  }
  return results;
}

const itemTimingConditions = getCombinations({
  hero: heroes,
  item: items,
  time: timings,
}, 0, [], {});

function buildTeamScenario(scenario, isRadiant, match) {
  const won = match.radiant_win === isRadiant;
  return [{
    columns: {
      scenario,
      is_radiant: isRadiant,
      patch: match.patch,
      game_mode: match.game_mode,
      lobby_type: match.lobby_type,
      region: match.region,
    },
    won,
    table: 'team_scenarios',
  }];
}

const scenarioChecks = [
  function itemTimings(match) {
    const rows = [];
    itemTimingConditions.forEach((c) => {
      const player = match.players.find(h => h.hero_id === c.hero);
      if (player) {
        const item = player.purchase_log.find(i => i.key === c.item);
        if (item && item.time && item.time < c.time) {
          const won = (player.player_slot < 5 && match.radiant_win) || (player.player_slot > 4 && !match.radiant_win);
          rows.push({
            columns: {
              scenario: 'Item Timing',
              hero: c.hero,
              item: c.item,
              time: c.time,
              patch: match.patch,
              game_mode: match.game_mode,
              region: match.region,
              lobby_type: match.lobby_type,
            },
            won,
            table: 'scenarios',
          });
        }
      }
    });
    return rows;
  },

  function firstBlood(match) {
    const condition = match.objectives.find(x => x.type === 'CHAT_MESSAGE_FIRSTBLOOD');
    if (condition) {
      const isRadiant = condition.player_slot < 5;
      return buildTeamScenario('First Blood', isRadiant, match);
    }
    return [];
  },

  function courierKill(match) {
    const condition = match.objectives.find(x => x.type === 'CHAT_MESSAGE_COURIER_LOST' && x.time < 180);
    if (condition) {
      const isRadiant = condition.team === 3;
      return buildTeamScenario('Courier Kill before 3min', isRadiant, match);
    }
    return [];
  },
];


module.exports.scenarioChecks = scenarioChecks;