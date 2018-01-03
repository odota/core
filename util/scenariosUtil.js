const constants = require('dotaconstants');


// all items that cost at least 2000
const dotaItems = Object.keys(constants.items).map(k => [constants.items[k], k]).filter(x => x[0].cost >= 2000).map(x => x[1]);
const timings = [7.5, 10, 12, 15, 20, 25, 30, 45, 60].map(x => x * 60);
const pingBucket = [10, 25, 50, 100, 150, 200, 500, 1000, 5000, 10000];
const gameDurationBucket = [15, 30, 45, 60, 90, 180, 360].map(x => x * 60);

const negativeWords = ['ff', 'report', 'gg', 'end', 'noob'];


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
            if (dotaItems.indexOf(item.key) !== -1) {
              const won = (player.player_slot < 5 && match.radiant_win) || (player.player_slot > 4 && !match.radiant_win);
              rows.push({
                columns: {
                  hero: player.hero_id,
                  item: item.key,
                  time: timings.find(x => x >= item.time) || -2,
                },
                won,
                table: 'scenarios',
              });
            }
          });
        }
      });
    }
    return rows;
  },

  function pings(match) { // how often a player "pings"
    const rows = [];
    if (match.players) {
      match.players.forEach((player) => {
        const pings = pingBucket.find(x => x >= player.pings) || -2;
        const won = (player.player_slot < 5 && match.radiant_win) || (player.player_slot > 4 && !match.radiant_win);
        rows.push({
          columns: {
            pings,
            game_duration: gameDurationBucket.find(x => x >= match.duration) || -2,
          },
          won,
          table: 'scenarios',
        });
      });
    }
    return rows;
  },

  function lane(match) { // on which lane was the hero
    const rows = [];
    if (match.players) {
      match.players.forEach((player) => {
        const won = (player.player_slot < 5 && match.radiant_win) || (player.player_slot > 4 && !match.radiant_win);
        rows.push({
          columns: {
            hero: player.hero_id,
            lane: player.lane,
            game_duration: gameDurationBucket.find(x => x >= match.duration) || -2,
          },
          won,
          table: 'scenarios',
        });
      });
    }
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

  function chatNegativity(match) { // negative words in chat before minute 10
    const rows = [];
    let radiantCondition = false;
    let direCondition = false;
    if (match.chat) {
      for (let i = 0; i < match.chat.length; i += 1) {
        const c = match.chat[i];
        if (c.time >= 600) {
          break;
        }
        if (negativeWords.some(word => c.key.toLowerCase().indexOf(word) !== -1)) {
          if (c.slot < 5) {
            radiantCondition = true;
          } else {
            direCondition = true;
          }
        }
      }
      if (radiantCondition) {
        rows.push(buildTeamScenario('Negativity in chat before 10min', true, match)[0]);
      }
      if (direCondition) {
        rows.push(buildTeamScenario('Negativity in chat before 10min', false, match)[0]);
      }
    }
    return rows;
  },
];


module.exports.scenarioChecks = scenarioChecks;
