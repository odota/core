const constants = require('dotaconstants');
const utility = require('./utility');

const playerWon = utility.playerWon;


// all items that cost at least 2000
const itemCost = 2000;
const dotaItems = Object.keys(constants.items).map(k => [constants.items[k], k]).filter(x => x[0].cost >= itemCost).map(x => x[1]);
const timings = [7.5, 10, 12, 15, 20, 25, 30].map(x => x * 60);
const pingBucket = [10, 25, 50, 100, 150, 200, 500, 1000];
const gameDurationBucket = [15, 30, 45, 60, 90].map(x => x * 60);

const negativeWords = ['ff', 'report', 'gg', 'end', 'noob'];
const positiveWords = ['gl', 'glhf', 'hf', 'good luck', 'have fun'];


function buildTeamScenario(scenario, isRadiant, match) {
  return [{
    scenario,
    is_radiant: isRadiant,
    region: match.region,
    wins: match.radiant_win === isRadiant ? '1' : '0',
  }];
}

const scenarioChecks = {
  scenarios: [

    function itemTimings(match) {
      const rows = [];
      match.players.forEach((player) => {
        player.purchase_log.forEach((item) => {
          if (dotaItems.indexOf(item.key) !== -1 && item.time <= timings[timings.length - 1]) {
            rows.push({
              hero_id: player.hero_id,
              item: item.key,
              time: timings.find(x => x >= item.time),
              wins: playerWon(player, match) ? '1' : '0',
            });
          }
        });
      });
      return rows;
    },

    function pings(match) { // how often a player "pings"
      const rows = [];
      match.players.forEach((player) => {
        if (player.pings <= pingBucket[pingBucket.length - 1]) {
          const pings = pingBucket.find(x => x >= player.pings);
          rows.push({
            pings,
            time: gameDurationBucket.find(x => x >= match.duration),
            wins: playerWon(player, match) ? '1' : '0',
          });
        }
      });
      return rows;
    },

    function laneRole(match) { // hero's lane role
      const rows = [];
      match.players.forEach((player) => {
        if (match.duration <= gameDurationBucket[gameDurationBucket.length - 1]) {
          rows.push({
            hero_id: player.hero_id,
            lane_role: player.lane_role,
            time: gameDurationBucket.find(x => x >= match.duration),
            wins: playerWon(player, match) ? '1' : '0',
          });
        }
      });
      return rows;
    },
  ],
  team_scenarios: [

    function firstBlood(match) {
      const condition = match.objectives && match.objectives.find(x => x.type === 'CHAT_MESSAGE_FIRSTBLOOD');
      if (condition) {
        const isRadiant = condition.player_slot < 5;
        return buildTeamScenario(teamScenariosQueryParams[first_blood], isRadiant, match);
      }
      return [];
    },

    function courierKill(match) { // team killed enemy courier at least once before the 3 min mark
      const condition = match.objectives && match.objectives.find(x => x.type === 'CHAT_MESSAGE_COURIER_LOST' && x.time < 180);
      if (condition) {
        const isRadiant = condition.team === 3;
        return buildTeamScenario(teamScenariosQueryParams[courier_kill], isRadiant, match);
      }
      return [];
    },

    function chat(match) { // negative/positive words in chat before minute 1
      const rows = [];
      let radiantNegative = false;
      let direNegative = false;
      let radiantPositive = false;
      let direPositive = false;
      if (match.chat) {
        for (let i = 0; i < match.chat.length; i += 1) {
          const c = match.chat[i];
          if (c.time >= 60) {
            break;
          }
          if (negativeWords.some(word => RegExp(`\\b${word}\\b`, 'i').test(c.key))) {
            if (c.player_slot < 128) {
              radiantNegative = true;
            } else {
              direNegative = true;
            }
          }
          if (positiveWords.some(word => RegExp(`\\b${word}\\b`, 'i').test(c.key))) {
            if (c.player_slot < 128) {
              radiantPositive = true;
            } else {
              direPositive = true;
            }
          }
        }
        if (radiantNegative) {
          rows.push(buildTeamScenario(teamScenariosQueryParams[neg_chat_1min], true, match)[0]);
        }
        if (direNegative) {
          rows.push(buildTeamScenario(teamScenariosQueryParams[neg_chat_1min], false, match)[0]);
        }
        if (radiantPositive) {
          rows.push(buildTeamScenario(teamScenariosQueryParams[pos_chat_1min], true, match)[0]);
        }
        if (direPositive) {
          rows.push(buildTeamScenario(teamScenariosQueryParams[pos_chat_1min], false, match)[0]);
        }
      }
      return rows;
    },
  ],
};

// list of match object properties that are required for scenario checks.
const matchProperties = ['players', 'objectives', 'duration', 'chat', 'radiant_win'];

/**
 * Make sure the match object has all required properties.
 * */
function validateMatchProperties(match) {
  return matchProperties.every(property => match[property] !== undefined && match[property] !== null);
}

const teamScenariosQueryParams = {
  pos_chat_1min: 'Positivity in chat before 1 minute',
  neg_chat_1min: 'Negativity in chat before 1 minute',
  courier_kill: 'Courier Kill before 3 minutes',
  first_blood: 'First Blood',
};

module.exports = {
  scenarioChecks,
  validateMatchProperties,
  teamScenariosQueryParams,
  itemCost,
};
