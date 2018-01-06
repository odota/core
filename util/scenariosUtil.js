const constants = require('dotaconstants');
const utility = require('./utility');

const playerWon = utility.playerWon;


// all items that cost at least 2000
const dotaItems = Object.keys(constants.items).map(k => [constants.items[k], k]).filter(x => x[0].cost >= 2000).map(x => x[1]);
const timings = [7.5, 10, 12, 15, 20, 25, 30].map(x => x * 60);
const pingBucket = [10, 25, 50, 100, 150, 200, 500, 1000];
const gameDurationBucket = [15, 30, 45, 60, 90].map(x => x * 60);

const negativeWords = ['ff', 'report', 'gg', 'end', 'noob'];
const positiveWords = ['gl', 'glhf', 'hf', 'good luck', 'have fun'];


function buildTeamScenario(scenario, isRadiant, match) {
  return [{
    columns: {
      scenario,
      is_radiant: isRadiant,
      region: match.region,
      wins: match.radiant_win === isRadiant ? '1' : '0',
    },
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
            if (dotaItems.indexOf(item.key) !== -1 && item.time <= timings[timings.length - 1]) {
              rows.push({
                columns: {
                  hero_id: player.hero_id,
                  item: item.key,
                  time: timings.find(x => x >= item.time),
                  wins: playerWon(player, match) ? '1' : '0',
                },
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
        if (player.pings <= pingBucket[pingBucket.length - 1]) {
          const pings = pingBucket.find(x => x >= player.pings);
          rows.push({
            columns: {
              pings,
              time: gameDurationBucket.find(x => x >= match.duration),
              wins: playerWon(player, match) ? '1' : '0',
            },
            table: 'scenarios',
          });
        }
      });
    }
    return rows;
  },

  function lane(match) { // on which lane was the hero
    const rows = [];
    if (match.players) {
      match.players.forEach((player) => {
        if (match.duration <= gameDurationBucket[gameDurationBucket.length - 1]) {
          rows.push({
            columns: {
              hero_id: player.hero_id,
              lane: player.lane,
              time: gameDurationBucket.find(x => x >= match.duration),
              wins: playerWon(player, match) ? '1' : '0',
            },
            table: 'scenarios',
          });
        }
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
        rows.push(buildTeamScenario('Negativity in chat before 1min', true, match)[0]);
      }
      if (direNegative) {
        rows.push(buildTeamScenario('Negativity in chat before 1min', false, match)[0]);
      }
      if (radiantPositive) {
        rows.push(buildTeamScenario('Positivity in chat before 1min', true, match)[0]);
      }
      if (direPositive) {
        rows.push(buildTeamScenario('Positivity in chat before 1min', false, match)[0]);
      }
    }
    return rows;
  },
];


module.exports.scenarioChecks = scenarioChecks;
