const constants = require('dotaconstants');


// all items that cost at least 2000
const dotaItems = Object.keys(constants.items).map(k => [constants.items[k], k]).filter(x => x[0].cost >= 2000).map(x => x[1]);
const timings = [7.5, 10, 12, 15, 20, 25, 30].map(function(x) {return x*60})

function buildTeamScenario(scenario, isRadiant, match) {
  const won = match.radiant_win === isRadiant;
  return [{
    columns: {
      scenario,
      is_radiant: isRadiant,
      region: match.region,
    },
    won,
    table: 'team_scenarios',
  }];
}

const scenarioChecks = [

  function itemTimings(match) {
    const rows = [];
    if (match.players) {
    match.players.forEach((player) => {
      if (player.purchase_log) {
      player.purchase_log.forEach((item) => {
        if (dotaItems.indexOf(item.key) !== -1 && item.time <= timings[timings.length -1]) {
          const won = (player.player_slot < 5 && match.radiant_win) || (player.player_slot > 4 && !match.radiant_win);
          rows.push({
            columns: {
              hero: player.hero_id,
              item: item.key,
              time: timings.find(function(x) {return x>=item.time}),
            },
            won,
            table: 'scenarios',
          });
        }
      });}
    });}
    return rows;
  },

  function baseScenario(match) { //always evaluate to true for a match that has the hero
    const rows = [];
    if (match.players) {
    match.players.forEach((player) => {
      const won = (player.player_slot
         < 5 && match.radiant_win) || (player.player_slot > 4 && !match.radiant_win);
      rows.push({
        columns: {
          hero: player.hero_id,
          item: 'base_scenario',
          time: 0,
        },
        won,
        table: 'scenarios',
      });
    });}
    return rows;
  },

  function firstBlood(match) {
    const condition = match.objectives && match.objectives.find(x => x.type === 'CHAT_MESSAGE_FIRSTBLOOD');
    if (condition) {
      const isRadiant = condition.player_slot < 5;
      return buildTeamScenario('First Blood', isRadiant, match);
    }
    return [];
  },

  function courierKill(match) { // team killed enemy courier at least once before the 3 min mark
    const condition = match.objectives && match.objectives.find(x => x.type === 'CHAT_MESSAGE_COURIER_LOST' && x.time < 180);
    if (condition) {
      const isRadiant = condition.team === 3;
      return buildTeamScenario('Courier Kill before 3min', isRadiant, match);
    }
    return [];
  },
];


module.exports.scenarioChecks = scenarioChecks;
